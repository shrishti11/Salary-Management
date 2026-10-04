import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { SortOrder } from "~/lib/employees-api";
import type { SalaryDirectoryRow, SalarySortField } from "~/lib/salary-directory-api";
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

function renderTable(
  rows: SalaryDirectoryRow[],
  { onSort = vi.fn(), onAction = vi.fn(), sortBy = "name" as SalarySortField, sortOrder = "asc" as SortOrder } = {},
) {
  const router = createMemoryRouter(
    [
      {
        path: "/employees",
        Component: () => (
          <EmployeeDirectoryTable rows={rows} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} onAction={onAction} />
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

  it("sorts by name, department, country, joined and salary effective date", async () => {
    const { onSort } = renderTable([row()]);
    for (const [label, field] of [
      ["Name", "name"],
      ["Department", "department"],
      ["Country", "country"],
      ["Joined", "joiningDate"],
      ["Current salary", "effectiveDate"],
    ] as const) {
      await userEvent.click(screen.getByRole("button", { name: label }));
      expect(onSort).toHaveBeenLastCalledWith(field);
    }
  });

  it("marks the Current salary column as sorted when sorting by effective date", () => {
    renderTable([row()], { sortBy: "effectiveDate", sortOrder: "desc" });
    expect(screen.getByRole("columnheader", { name: /^Current salary/ })).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByRole("columnheader", { name: /^Name/ })).not.toHaveAttribute("aria-sort");
  });

  it("shows when the current salary took effect, only when one exists", () => {
    renderTable([row(), row({ id: "e2", firstName: "Kenji" }, { current: null })]);
    expect(within(screen.getByRole("row", { name: /Asha Rao/ })).getByText("since Jan 1, 2026")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Kenji Rao/ })).queryByText(/^since/)).not.toBeInTheDocument();
  });

  it("formats each salary in the employee's own currency", () => {
    renderTable([
      row({ id: "e1" }, { current: { id: "s1", currency: "INR", effectiveDate: "2026-01-01", gross: "1250000.50", net: "1", deductions: "0", reason: null } }),
      row({ id: "e2", firstName: "Kenji" }, { current: { id: "s2", currency: "JPY", effectiveDate: "2026-01-01", gross: "600000", net: "1", deductions: "0", reason: null } }),
    ]);
    expect(within(screen.getByRole("row", { name: /Asha Rao/ })).getByText("₹1,250,000.50")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Kenji Rao/ })).getByText("¥600,000")).toBeInTheDocument();
  });

  it("shows Revision scheduled only when a future salary exists, and each row's status", () => {
    renderTable([row({ id: "e1" }, { hasScheduled: true }), row({ id: "e2", firstName: "Kenji", status: "INACTIVE" })]);
    expect(within(screen.getByRole("row", { name: /Asha Rao/ })).getByText("Revision scheduled")).toBeInTheDocument();
    const second = screen.getByRole("row", { name: /Kenji Rao/ });
    expect(within(second).queryByText("Revision scheduled")).not.toBeInTheDocument();
    expect(within(second).getByText("Inactive")).toBeInTheDocument();
  });

  it("marks the active sort column", () => {
    renderTable([row()]);
    expect(screen.getByRole("columnheader", { name: /^Name/ })).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("columnheader", { name: /^Joined/ })).not.toHaveAttribute("aria-sort");
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
