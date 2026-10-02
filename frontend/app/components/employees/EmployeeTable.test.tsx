import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { Employee } from "~/lib/employees-api";
import EmployeeTable from "./EmployeeTable";

const employee = (overrides: Partial<Employee> = {}): Employee => ({
  id: "e1",
  employeeCode: "EMP-0001",
  firstName: "Asha",
  lastName: "Rao",
  email: "asha@example.com",
  phone: null,
  departmentId: "d1",
  department: { id: "d1", name: "Engineering" },
  designation: "Engineer",
  country: "IN",
  joiningDate: "2024-01-15",
  status: "ACTIVE",
  createdAt: "",
  updatedAt: "",
  ...overrides,
});

function renderTable(employees: Employee[], onSort = vi.fn()) {
  const router = createMemoryRouter([
    {
      path: "/",
      element: <EmployeeTable employees={employees} sortBy="employeeCode" sortOrder="asc" onSort={onSort} />,
    },
  ]);
  render(<RouterProvider router={router} />);
  return onSort;
}

describe("EmployeeTable", () => {
  it("shows the required columns and a profile link per row", () => {
    renderTable([
      employee(),
      employee({ id: "e2", employeeCode: "EMP-0002", firstName: "Mei", lastName: "Tan", status: "INACTIVE", country: "SG" }),
    ]);

    for (const name of ["Employee ID", "Name", "Department", "Designation", "Country", "Joined", "Status"]) {
      expect(screen.getByRole("columnheader", { name: new RegExp(name) })).toBeInTheDocument();
    }
    const row = screen.getByRole("row", { name: /EMP-0001/ });
    expect(within(row).getByRole("link", { name: "Asha Rao" })).toHaveAttribute("href", "/employees/e1");
    expect(within(row).getByText("India")).toBeInTheDocument();
    expect(within(row).getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("marks the active sort column and reports header clicks", async () => {
    const onSort = renderTable([employee()]);

    expect(screen.getByRole("columnheader", { name: /Employee ID/ })).toHaveAttribute("aria-sort", "ascending");
    await userEvent.click(screen.getByText("Name"));
    expect(onSort).toHaveBeenCalledWith("name");
  });
});
