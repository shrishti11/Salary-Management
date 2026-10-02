import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import EmployeeNew, { action } from "./employee-new";

const body = {
  employeeCode: "EMP-9", firstName: "Asha", lastName: "Rao", email: "asha@example.com", phone: "",
  departmentId: "d1", designation: "Engineer", country: "IN", joiningDate: "2024-01-15",
};
const call = () =>
  action({
    request: new Request("http://localhost:3000/employees/new", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: "session=abc" },
      body: JSON.stringify(body),
    }),
    params: {},
    context: {},
  } as Parameters<typeof action>[0]);
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("employee-new action", () => {
  it("creates and redirects to the profile with a notice", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ employee: { id: "e1" } }, 201));
    vi.stubGlobal("fetch", fetchMock);

    const result = (await call()) as Response;

    expect(result.status).toBe(302);
    expect(result.headers.get("Location")).toBe("/employees/e1?notice=created");
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it.each([
    ["DUPLICATE_EMPLOYEE_CODE", "employeeCode"],
    ["DUPLICATE_EMAIL", "email"],
  ])("maps %s to the %s field", async (code, field) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { message: "Conflict", code } }, 409)));
    expect(await call()).toEqual({ error: { message: "Conflict", field } });
  });

  it("returns a form-level error for other failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { message: "Validation failed", code: "VALIDATION_ERROR" } }, 400)));
    expect(await call()).toEqual({ error: { message: "Validation failed" } });
  });
});

describe("employee-new page", () => {
  const departments = [{ id: "d1", name: "Engineering" }];

  function renderPage(routeAction?: () => unknown) {
    const router = createMemoryRouter(
      [
        {
          path: "/employees/new",
          loader: () => ({ departments }),
          action: routeAction as never,
          Component: EmployeeNew,
        },
      ],
      { initialEntries: ["/employees/new"] },
    );
    render(<RouterProvider router={router} />);
  }

  it("renders the heading, form and department options", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Add employee" })).toBeInTheDocument();
    expect(screen.getByLabelText("Employee ID")).toBeEnabled();
    expect(screen.getByRole("option", { name: "Engineering" })).toBeInTheDocument();
  });

  it("shows the action error banner after submit", async () => {
    renderPage(() => ({ error: { message: "Boom" } }));
    await userEvent.type(await screen.findByLabelText("Employee ID"), "emp-9");
    await userEvent.type(screen.getByLabelText("First name"), "Asha");
    await userEvent.type(screen.getByLabelText("Last name"), "Rao");
    await userEvent.type(screen.getByLabelText("Email"), "asha@example.com");
    await userEvent.selectOptions(screen.getByLabelText("Department"), "d1");
    await userEvent.type(screen.getByLabelText("Designation"), "Engineer");
    await userEvent.selectOptions(screen.getByLabelText("Country"), "IN");
    await userEvent.type(screen.getByLabelText("Joining date"), "2024-01-15");
    await userEvent.click(screen.getByRole("button", { name: "Save employee" }));

    expect(await screen.findByText("Boom")).toBeInTheDocument();
  });
});
