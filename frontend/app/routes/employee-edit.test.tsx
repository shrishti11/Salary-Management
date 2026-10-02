import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import EmployeeEdit, { action, loader } from "./employee-edit";

const employee = {
  id: "e1",
  employeeCode: "EMP-1",
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
};
const departments = [{ id: "d1", name: "Engineering" }];
const body = {
  employeeCode: "EMP-1", firstName: "Asha", lastName: "Rao", email: "asha@example.com", phone: "",
  departmentId: "d1", designation: "Engineer", country: "IN", joiningDate: "2024-01-15",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

const args = (init: RequestInit = {}) =>
  ({
    request: new Request("http://localhost:3000/employees/e1/edit", {
      headers: { "Content-Type": "application/json", cookie: "session=abc" },
      ...init,
    }),
    params: { id: "e1" },
    context: {},
  }) as never;

const callAction = () => action(args({ method: "POST", body: JSON.stringify(body) }));

afterEach(() => vi.unstubAllGlobals());

describe("employee-edit action", () => {
  it("strips employeeCode, PATCHes, and redirects with a notice", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ employee }));
    vi.stubGlobal("fetch", fetchMock);

    const result = (await callAction()) as Response;

    expect(result.status).toBe(302);
    expect(result.headers.get("Location")).toBe("/employees/e1?notice=updated");
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(String(url)).toContain("/api/employees/e1");
    expect(init.method).toBe("PATCH");
    const sent = JSON.parse(init.body as string);
    expect(sent).not.toHaveProperty("employeeCode");
    const { employeeCode: _code, ...expected } = body;
    expect(sent).toEqual(expected);
  });

  it("maps DUPLICATE_EMAIL to the email field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { message: "Taken", code: "DUPLICATE_EMAIL" } }, 409)));
    expect(await callAction()).toEqual({ error: { message: "Taken", field: "email" } });
  });

  it("returns a form-level error for a 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { message: "Employee not found", code: "NOT_FOUND" } }, 404)));
    expect(await callAction()).toEqual({ error: { message: "Employee not found" } });
  });
});

describe("employee-edit loader", () => {
  it("returns the employee and departments", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes("/api/departments") ? json({ departments }) : json({ employee }),
      ),
    );
    expect(await loader(args())).toEqual({ employee, departments });
  });

  it("throws a 404 Response when the employee is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInit | string | URL) =>
        String(input).includes("/api/departments")
          ? json({ departments })
          : json({ error: { message: "Employee not found", code: "NOT_FOUND" } }, 404),
      ),
    );
    const thrown = await loader(args()).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(404);
  });
});

describe("employee-edit page", () => {
  it("renders a prefilled form with a locked Employee ID and a Cancel link to the profile", async () => {
    const router = createMemoryRouter(
      [{ path: "/employees/:id/edit", loader: () => ({ employee, departments }), Component: EmployeeEdit }],
      { initialEntries: ["/employees/e1/edit"] },
    );
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("heading", { name: "Edit employee" })).toBeInTheDocument();
    expect(screen.getByLabelText("Employee ID")).toBeDisabled();
    expect(screen.getByLabelText("Employee ID")).toHaveValue("EMP-1");
    expect(screen.getByLabelText("First name")).toHaveValue("Asha");
    expect(screen.getByLabelText("Department")).toHaveValue("d1");
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/employees/e1");
  });
});
