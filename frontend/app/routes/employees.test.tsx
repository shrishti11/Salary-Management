import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import Employees, { ErrorBoundary, loader } from "./employees";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const employee = (n: number) => ({
  id: `e${n}`,
  employeeCode: `EMP-000${n}`,
  firstName: "First" + n,
  lastName: "Last" + n,
  email: `e${n}@example.com`,
  phone: null,
  departmentId: "d1",
  department: { id: "d1", name: "Engineering" },
  designation: "Engineer",
  country: "IN",
  joiningDate: "2024-01-15",
  status: "ACTIVE",
  createdAt: "",
  updatedAt: "",
});

function stubBackend(handler: (url: URL) => Response) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => handler(new URL(String(input))));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const DEPT_ID = "11111111-1111-4111-8111-111111111111";
const departments = { departments: [{ id: DEPT_ID, name: "Engineering" }] };
const emptyList = { data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };

/** Routes /api/departments to the fixture and /api/employees to `employees`. */
function backendWith(employees: (url: URL) => Response, seen: URL[] = []) {
  return stubBackend((url) => {
    if (url.pathname === "/api/departments") return json(departments);
    seen.push(url);
    return employees(url);
  });
}

const twoEmployees = () =>
  json({ data: [employee(1), employee(2)], pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 } });

function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/employees",
        loader: ({ request }) => loader({ request, params: {}, context: {} } as Parameters<typeof loader>[0]),
        Component: Employees,
        ErrorBoundary,
      },
      { path: "/login", Component: () => <div>login page</div> },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => vi.unstubAllGlobals());

describe("employees route", () => {
  it("lists employees with heading, add link and pagination summary", async () => {
    backendWith(twoEmployees);
    renderAt("/employees");

    expect(await screen.findByText("EMP-0001")).toBeInTheDocument();
    expect(screen.getByText("EMP-0002")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Employees" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add employee" })).toHaveAttribute("href", "/employees/new");
    expect(screen.getByText("1–2 of 2")).toBeInTheDocument();
  });

  it("passes URL params to the API", async () => {
    const seen: URL[] = [];
    backendWith(twoEmployees, seen);
    renderAt("/employees?q=asha&status=INACTIVE&sortBy=name&sortOrder=desc&page=2");

    await screen.findByText("EMP-0001");
    const params = seen[0].searchParams;
    expect(params.get("q")).toBe("asha");
    expect(params.get("status")).toBe("INACTIVE");
    expect(params.get("sortBy")).toBe("name");
    expect(params.get("sortOrder")).toBe("desc");
    expect(params.get("page")).toBe("2");
  });

  it("ignores tampered params", async () => {
    const seen: URL[] = [];
    backendWith(twoEmployees, seen);
    renderAt("/employees?sortBy=passwordHash&pageSize=9999&status=FIRED");

    await screen.findByText("EMP-0001");
    const params = seen[0].searchParams;
    expect(params.has("sortBy")).toBe(false);
    expect(params.has("pageSize")).toBe(false);
    expect(params.has("status")).toBe(false);
  });

  it("shows an empty state with a call to action when there are no employees", async () => {
    backendWith(() => json(emptyList));
    renderAt("/employees");

    expect(await screen.findByText("No employees yet")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "Add employee" });
    expect(links.length).toBeGreaterThanOrEqual(1);
    links.forEach((link) => expect(link).toHaveAttribute("href", "/employees/new"));
  });

  it("shows a filtered empty state and Clear filters resets filters but keeps sort", async () => {
    backendWith(() => json(emptyList));
    const router = renderAt("/employees?q=zzz&status=ACTIVE&sortBy=name");

    expect(await screen.findByText("No employees match your filters")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    await waitFor(() => expect(router.state.location.search).not.toContain("q="));
    const search = new URLSearchParams(router.state.location.search);
    expect(search.has("status")).toBe(false);
    expect(search.get("sortBy")).toBe("name");
  });

  it("redirects an out-of-range page to the last page", async () => {
    backendWith((url) =>
      url.searchParams.get("page") === "9"
        ? json({ data: [], pagination: { page: 9, pageSize: 20, total: 45, totalPages: 3 } })
        : json({ data: [employee(1)], pagination: { page: 3, pageSize: 20, total: 45, totalPages: 3 } }),
    );
    const router = renderAt("/employees?page=9");

    await waitFor(() => expect(router.state.location.search).toContain("page=3"));
    expect(await screen.findByText("EMP-0001")).toBeInTheDocument();
  });

  it("sorts when a column header is clicked", async () => {
    backendWith(twoEmployees);
    const router = renderAt("/employees");

    await screen.findByText("EMP-0001");
    await userEvent.click(screen.getByText("Name"));

    await waitFor(() => expect(router.state.location.search).toContain("sortBy=name"));
    await screen.findByText("EMP-0001");
  });

  it("shows the error boundary when the backend fails", async () => {
    backendWith(() => json({ error: { message: "boom" } }, 500));
    renderAt("/employees");

    expect(await screen.findByText(/Could not load employees/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/employees");
  });

  it("redirects to /login when unauthenticated", async () => {
    stubBackend(() => json({ error: { message: "Unauthorized" } }, 401));
    renderAt("/employees");

    expect(await screen.findByText("login page")).toBeInTheDocument();
  });

  it("does not redirect when the last page itself comes back empty", async () => {
    const seen: URL[] = [];
    backendWith(
      () => json({ data: [], pagination: { page: 3, pageSize: 20, total: 45, totalPages: 3 } }),
      seen,
    );
    const router = renderAt("/employees?page=3");

    expect(await screen.findByText("No employees yet")).toBeInTheDocument();
    expect(router.state.location.search).toBe("?page=3");
    expect(seen).toHaveLength(1);
  });

  it("keeps both the search text and a department chosen right after typing", async () => {
    backendWith(twoEmployees);
    const router = renderAt("/employees");
    await screen.findByText("EMP-0001");

    await userEvent.type(screen.getByLabelText("Search"), "asha");
    await userEvent.selectOptions(screen.getByLabelText("Department"), DEPT_ID);

    await waitFor(() => {
      const search = new URLSearchParams(router.state.location.search);
      expect(search.get("q")).toBe("asha");
      expect(search.get("departmentId")).toBe(DEPT_ID);
    });
  });
});
