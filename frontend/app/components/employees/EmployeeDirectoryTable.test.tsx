import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { SalaryDirectoryRow } from "~/lib/salary-directory-api";
import EmployeeDirectoryTable from "./EmployeeDirectoryTable";

const row = (overrides: Partial<SalaryDirectoryRow["employee"]> = {}, extra: Partial<SalaryDirectoryRow> = {}): SalaryDirectoryRow => ({
  employee: {
    id: "e1",
    employeeCode: "EMP-0001",
    firstName: "Asha",
    lastName: "Rao",
    email: "asha@example.com",
    department: { id: "d1", name: "Engineering" },
    country: "IN",
    designation: "Engineer",
    joiningDate: "2024-01-15",
    status: "ACTIVE",
    ...overrides,
  },
  current: {
    id: "s1",
    currency: "USD",
    effectiveDate: "2026-01-01",
    gross: "120000.00",
    net: "100000.00",
    deductions: "20000.00",
    reason: null,
  },
  hasScheduled: false,
  ...extra,
});

function renderTable(rows: SalaryDirectoryRow[], { onSort = vi.fn(), onAction = vi.fn() } = {}) {
  const router = createMemoryRouter(
    [
      {
        path: "/employees",
        Component: () => (
          <EmployeeDirectoryTable rows={rows} sortBy="name" sortOrder="asc" onSort={onSort} onAction={onAction} />
        ),
      },
      { path: "/employees/:id", Component: () => <div>profile page</div> },
    ],
    { initialEntries: ["/employees"] },
  );
  render(<RouterProvider router={router} />);
  return { router, onSort, onAction };
}

const openMenu = (name: string) => userEvent.click(screen.getByRole("button", { name: `Actions for ${name}` }));

describe("EmployeeDirectoryTable", () => {
  it("shows name link with email and ID caption, department with designation, salary and status", () => {
    renderTable([row()]);
    const r = screen.getByRole("row", { name: /Asha Rao/ });
    expect(within(r).getByRole("link", { name: "Asha Rao" })).toHaveAttribute("href", "/employees/e1");
    expect(within(r).getByText("asha@example.com · EMP-0001")).toBeInTheDocument();
    expect(within(r).getByText("Engineering")).toBeInTheDocument();
    expect(within(r).getByText("Engineer")).toBeInTheDocument();
    expect(within(r).getByText("India")).toBeInTheDocument();
    expect(within(r).getByText("Jan 15, 2024")).toBeInTheDocument();
    expect(within(r).getByText("$120,000.00")).toBeInTheDocument();
    expect(within(r).getByText("Active")).toBeInTheDocument();
  });

  it("shows No salary and Revision scheduled markers", () => {
    renderTable([row({}, { current: null, hasScheduled: true })]);
    const r = screen.getByRole("row", { name: /Asha Rao/ });
    expect(within(r).getByText("No salary")).toBeInTheDocument();
    expect(within(r).getByText("Revision scheduled")).toBeInTheDocument();
  });

  it("sorts by name, department, country and joined, but not salary", async () => {
    const { onSort } = renderTable([row()]);
    for (const [label, field] of [
      ["Name", "name"],
      ["Department", "department"],
      ["Country", "country"],
      ["Joined", "joiningDate"],
    ] as const) {
      await userEvent.click(screen.getByRole("button", { name: label }));
      expect(onSort).toHaveBeenLastCalledWith(field);
    }
    expect(screen.queryByRole("button", { name: /Current salary/ })).not.toBeInTheDocument();
  });

  it("opens the profile when a row is clicked", async () => {
    const { router } = renderTable([row()]);
    await userEvent.click(screen.getByText("Engineering"));
    expect(router.state.location.pathname).toBe("/employees/e1");
  });

  it("offers View, Edit, Revise salary and Deactivate for an active employee with salary", async () => {
    const { router, onAction } = renderTable([row()]);
    await openMenu("Asha Rao");
    expect(screen.getByRole("menuitem", { name: "View" })).toHaveAttribute("href", "/employees/e1");
    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveAttribute("href", "/employees/e1?edit=1");
    expect(screen.getByRole("menuitem", { name: "Revise salary" })).toHaveAttribute("href", "/employees/e1?salary=revise");
    expect(screen.queryByRole("menuitem", { name: "Reactivate" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("menuitem", { name: "Deactivate" }));
    expect(onAction).toHaveBeenCalledWith("deactivate", expect.objectContaining({ employee: expect.objectContaining({ id: "e1" }) }));
    // the menu click must not bubble to the row and open the profile
    expect(router.state.location.pathname).toBe("/employees");
  });

  it("offers Set salary when there is no current salary", async () => {
    renderTable([row({}, { current: null })]);
    await openMenu("Asha Rao");
    expect(screen.getByRole("menuitem", { name: "Set salary" })).toHaveAttribute("href", "/employees/e1?salary=initial");
  });

  it("offers Reactivate and no salary action for an inactive employee", async () => {
    const { onAction } = renderTable([row({ status: "INACTIVE" })]);
    await openMenu("Asha Rao");
    expect(screen.queryByRole("menuitem", { name: /salary/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Deactivate" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "Reactivate" }));
    expect(onAction).toHaveBeenCalledWith("reactivate", expect.anything());
  });
});
