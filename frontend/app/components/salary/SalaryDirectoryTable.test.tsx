import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { SalaryDirectoryRow } from "~/lib/salary-directory-api";
import SalaryDirectoryTable from "./SalaryDirectoryTable";

const row = (overrides: Partial<SalaryDirectoryRow> = {}, employee: Partial<SalaryDirectoryRow["employee"]> = {}): SalaryDirectoryRow => ({
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
    ...employee,
  },
  current: {
    id: "s1",
    currency: "INR",
    effectiveDate: "2026-01-01",
    gross: "1250000.50",
    net: "1100000.25",
    deductions: "150000.25",
    reason: null,
  },
  hasScheduled: false,
  ...overrides,
});

function renderTable(rows: SalaryDirectoryRow[], onSort = vi.fn()) {
  const router = createMemoryRouter([
    { path: "/", element: <SalaryDirectoryTable rows={rows} sortBy="name" sortOrder="asc" onSort={onSort} /> },
  ]);
  render(<RouterProvider router={router} />);
  return onSort;
}

describe("SalaryDirectoryTable", () => {
  it("shows columns, a profile link, and amounts formatted in the employee's currency", () => {
    renderTable([
      row(),
      row(
        { current: { id: "s2", currency: "JPY", effectiveDate: "2026-02-01", gross: "600000", net: "500000", deductions: "100000", reason: null } },
        { id: "e2", employeeCode: "EMP-0002", firstName: "Mei", lastName: "Tan", country: "SG" },
      ),
    ]);

    for (const name of ["Employee", "Employee ID", "Department", "Country", "Currency", "Gross", "Net", "Effective date"]) {
      expect(screen.getByRole("columnheader", { name: new RegExp(`^${name}$`) })).toBeInTheDocument();
    }
    const first = screen.getByRole("row", { name: /EMP-0001/ });
    expect(within(first).getByRole("link", { name: "Asha Rao" })).toHaveAttribute("href", "/employees/e1");
    expect(within(first).getByText("Engineering")).toBeInTheDocument();
    expect(within(first).getByText("India")).toBeInTheDocument();
    expect(within(first).getByText("INR")).toBeInTheDocument();
    expect(within(first).getByText("₹1,250,000.50")).toBeInTheDocument();
    expect(within(first).getByText("₹1,100,000.25")).toBeInTheDocument();
    expect(within(first).getByText(/2026-01-01/)).toBeInTheDocument();

    const second = screen.getByRole("row", { name: /EMP-0002/ });
    expect(within(second).getByText("¥600,000")).toBeInTheDocument();
    expect(within(second).getByText("¥500,000")).toBeInTheDocument();
  });

  it("shows a muted No salary placeholder for employees without a current salary", () => {
    renderTable([row({ current: null })]);
    const r = screen.getByRole("row", { name: /EMP-0001/ });
    expect(within(r).getAllByText("No salary")).toHaveLength(2);
    expect(within(r).queryByText("Scheduled")).not.toBeInTheDocument();
  });

  it("shows a Scheduled chip only when a future salary exists", () => {
    renderTable([row({ hasScheduled: true }), row({}, { id: "e2", employeeCode: "EMP-0002" })]);
    expect(within(screen.getByRole("row", { name: /EMP-0001/ })).getByText("Scheduled")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /EMP-0002/ })).queryByText("Scheduled")).not.toBeInTheDocument();
  });

  it("shows a Scheduled chip even without a current salary", () => {
    renderTable([row({ current: null, hasScheduled: true })]);
    expect(screen.getByText("Scheduled")).toBeInTheDocument();
  });

  it("marks inactive employees only", () => {
    renderTable([row({}, { status: "INACTIVE" }), row({}, { id: "e2", employeeCode: "EMP-0002" })]);
    expect(within(screen.getByRole("row", { name: /EMP-0001/ })).getByText("Inactive")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /EMP-0002/ })).queryByText(/Active/)).not.toBeInTheDocument();
  });

  it("marks the active sort column, reports header clicks, and does not sort amounts", async () => {
    const onSort = renderTable([row()]);
    expect(screen.getByRole("columnheader", { name: /^Employee$/ })).toHaveAttribute("aria-sort", "ascending");
    await userEvent.click(screen.getByText("Effective date"));
    expect(onSort).toHaveBeenCalledWith("effectiveDate");
    await userEvent.click(screen.getByText("Employee ID"));
    expect(onSort).toHaveBeenCalledWith("employeeCode");
    expect(within(screen.getByRole("columnheader", { name: "Gross" })).queryByRole("button")).toBeNull();
    expect(within(screen.getByRole("columnheader", { name: "Net" })).queryByRole("button")).toBeNull();
  });
});
