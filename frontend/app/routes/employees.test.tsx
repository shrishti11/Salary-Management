import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "~/components/common/ToastProvider";
import Employees, { ErrorBoundary, action, loader } from "./employees";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const row = (n: number, { salary = true, status = "ACTIVE", scheduled = false } = {}) => ({
  employee: {
    id: `e${n}`,
    employeeCode: `EMP-000${n}`,
    firstName: "First" + n,
    lastName: "Last" + n,
    email: `e${n}@example.com`,
    department: { id: "d1", name: "Engineering" },
    country: "IN",
    designation: "Engineer " + n,
    joiningDate: "2024-01-15",
    status,
  },
  current: salary
    ? { id: `s${n}`, currency: "USD", effectiveDate: "2026-01-01", gross: "120000.00", net: "100000.00", deductions: "20000.00", reason: null }
    : null,
  hasScheduled: scheduled,
});

const DEPT_ID = "11111111-1111-4111-8111-111111111111";
const departments = { departments: [{ id: DEPT_ID, name: "Engineering" }] };
const emptyList = { data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };
const list = (...rows: ReturnType<typeof row>[]) =>
  json({ data: rows, pagination: { page: 1, pageSize: 20, total: rows.length, totalPages: 1 } });

type Handler = (url: URL, init?: RequestInit) => Response;

/** Routes /api/departments to the fixture, GET /api/salaries to `directory` and anything else to `other`. */
function backendWith(directory: (url: URL) => Response, seen: URL[] = [], other?: Handler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/departments") return json(departments);
    if (url.pathname === "/api/salaries") {
      seen.push(url);
      return directory(url);
    }
    if (other) return other(url, init);
    throw new Error(`unexpected request ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const twoRows = () => list(row(1, { scheduled: true }), row(2, { salary: false }));

function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/employees",
        loader: ({ request }) => loader({ request, params: {}, context: {} } as Parameters<typeof loader>[0]),
        action: ({ request }) => action({ request, params: {}, context: {} } as Parameters<typeof action>[0]),
        Component: () => (
          <ToastProvider>
            <Employees />
          </ToastProvider>
        ),
        ErrorBoundary,
      },
      { path: "/employees/:id", Component: () => <div>profile page</div> },
      { path: "/login", Component: () => <div>login page</div> },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const search = (router: ReturnType<typeof renderAt>) => new URLSearchParams(router.state.location.search);

afterEach(() => vi.unstubAllGlobals());

describe("employees route: list", () => {
  it("renders rows with name, email, designation, salary, No salary and Revision scheduled markers", async () => {
    backendWith(twoRows);
    renderAt("/employees");

    expect(await screen.findByRole("link", { name: "First1 Last1" })).toHaveAttribute("href", "/employees/e1");
    expect(screen.getByRole("heading", { name: "Employees" })).toBeInTheDocument();
    expect(screen.getByText("2 people")).toBeInTheDocument();
    const first = screen.getByRole("row", { name: /First1 Last1/ });
    expect(within(first).getByText("e1@example.com · EMP-0001")).toBeInTheDocument();
    expect(within(first).getByText("Engineer 1")).toBeInTheDocument();
    expect(within(first).getByText("$120,000.00")).toBeInTheDocument();
    expect(within(first).getByText("Revision scheduled")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /First2 Last2/ })).getByText("No salary")).toBeInTheDocument();
    expect(screen.getByText("1–2 of 2")).toBeInTheDocument();
  });

  it("shows status Active selected by default", async () => {
    backendWith(twoRows);
    renderAt("/employees");
    await screen.findByText("First1 Last1");
    expect(screen.getByRole("button", { name: "Active" })).toHaveAttribute("aria-pressed", "true");
  });

  it("writes the search into the URL q param", async () => {
    backendWith(twoRows);
    const router = renderAt("/employees?status=ALL");
    await screen.findByText("First1 Last1");

    await userEvent.type(screen.getByLabelText("Search"), "asha");
    await waitFor(() => expect(search(router).get("q")).toBe("asha"));
    expect(search(router).get("status")).toBe("ALL");
  });

  it("omits the default status from the URL and resets to page 1 on filter change", async () => {
    backendWith(twoRows);
    const router = renderAt("/employees?status=INACTIVE&page=2");
    await screen.findByText("First1 Last1");

    await userEvent.click(screen.getByRole("button", { name: "Active" }));
    await waitFor(() => expect(router.state.location.search).toBe(""));
  });

  it("passes URL params to the API and ignores tampered ones", async () => {
    const seen: URL[] = [];
    backendWith(twoRows, seen);
    renderAt("/employees?q=asha&status=ALL&salary=without&sortBy=joiningDate&sortOrder=desc&pageSize=9999&add=1");

    await screen.findByText("First1 Last1");
    expect(Object.fromEntries(seen[0].searchParams)).toEqual({
      q: "asha",
      status: "ALL",
      salary: "without",
      sortBy: "joiningDate",
      sortOrder: "desc",
    });
  });

  it("sorts by joining date when the Joined header is clicked", async () => {
    backendWith(twoRows);
    const router = renderAt("/employees");
    await screen.findByText("First1 Last1");

    await userEvent.click(screen.getByRole("button", { name: "Joined" }));
    await waitFor(() => expect(search(router).get("sortBy")).toBe("joiningDate"));
  });

  it("shows a filtered empty state whose Clear filters resets filters but keeps sort", async () => {
    backendWith(() => json(emptyList));
    const router = renderAt("/employees?q=zzz&status=ALL&sortBy=country");

    expect(await screen.findByText("No employees match your filters")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    await waitFor(() => expect(search(router).has("q")).toBe(false));
    expect(search(router).has("status")).toBe(false);
    expect(search(router).get("sortBy")).toBe("country");
  });

  it("shows a first-run empty state whose Add employee opens the dialog", async () => {
    backendWith(() => json(emptyList));
    const router = renderAt("/employees");

    expect(await screen.findByText("No employees yet")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: "Add employee" });
    await userEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(search(router).get("add")).toBe("1"));
    expect(await screen.findByRole("dialog", { name: "Add employee" })).toBeInTheDocument();
  });

  it("hides Set/Revise salary for an inactive row and offers Reactivate", async () => {
    backendWith(() => list(row(3, { status: "INACTIVE" })));
    renderAt("/employees?status=INACTIVE");
    await screen.findByText("First3 Last3");

    await userEvent.click(screen.getByRole("button", { name: "Actions for First3 Last3" }));
    expect(screen.queryByRole("menuitem", { name: "Set salary" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Revise salary" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Reactivate" })).toBeInTheDocument();
  });

  it("redirects an out-of-range page to the last page", async () => {
    backendWith((url) =>
      url.searchParams.get("page") === "9"
        ? json({ data: [], pagination: { page: 9, pageSize: 20, total: 45, totalPages: 3 } })
        : json({ data: [row(1)], pagination: { page: 3, pageSize: 20, total: 45, totalPages: 3 } }),
    );
    const router = renderAt("/employees?page=9");

    await waitFor(() => expect(router.state.location.search).toBe("?page=3"));
    expect(router.state.location.pathname).toBe("/employees");
    expect(await screen.findByText("First1 Last1")).toBeInTheDocument();
  });

  it("shows the error boundary when the backend fails", async () => {
    backendWith(() => json({ error: { message: "boom" } }, 500));
    renderAt("/employees");

    expect(await screen.findByText(/Could not load employees/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/employees");
  });

  it("redirects to /login when unauthenticated", async () => {
    backendWith(() => json({ error: { message: "Unauthorized" } }, 401));
    renderAt("/employees");

    expect(await screen.findByText("login page")).toBeInTheDocument();
  });
});

async function fillEmployee() {
  const d = within(screen.getByRole("dialog"));
  await userEvent.type(d.getByLabelText("Employee ID"), "EMP-9");
  await userEvent.type(d.getByLabelText("First name"), "Asha");
  await userEvent.type(d.getByLabelText("Last name"), "Rao");
  await userEvent.type(d.getByLabelText("Work email"), "asha@example.com");
  await userEvent.selectOptions(d.getByLabelText("Department"), DEPT_ID);
  await userEvent.type(d.getByLabelText("Designation"), "Engineer");
  await userEvent.selectOptions(d.getByLabelText("Country"), "IN");
  await userEvent.type(d.getByLabelText("Joining date"), "2024-01-15");
}

describe("employees route: add dialog", () => {
  it("opens from ?add=1 and Cancel removes only add", async () => {
    backendWith(twoRows);
    const router = renderAt("/employees?q=asha&add=1");

    expect(await screen.findByRole("dialog", { name: "Add employee" })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(search(router).has("add")).toBe(false));
    expect(search(router).get("q")).toBe("asha");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("opens from the header button", async () => {
    backendWith(twoRows);
    const router = renderAt("/employees?status=ALL");
    await screen.findByText("First1 Last1");

    await userEvent.click(screen.getByRole("button", { name: "Add employee" }));
    await waitFor(() => expect(search(router).get("add")).toBe("1"));
    expect(search(router).get("status")).toBe("ALL");
    expect(await screen.findByRole("dialog", { name: "Add employee" })).toBeInTheDocument();
  });

  it("creates the employee, closes the dialog, toasts with a Set salary action and reloads the list", async () => {
    const seen: URL[] = [];
    const fetchMock = backendWith(twoRows, seen, (url, init) => {
      if (url.pathname === "/api/employees" && init?.method === "POST") return json({ employee: { id: "new-1" } }, 201);
      throw new Error("unexpected");
    });
    const router = renderAt("/employees?q=asha&add=1");
    await screen.findByRole("dialog", { name: "Add employee" });

    await fillEmployee();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add employee" }));

    const toast = await screen.findByRole("status");
    expect(toast).toHaveTextContent("Employee added");
    expect(within(toast).getByRole("link", { name: "Set salary" })).toHaveAttribute("href", "/employees/new-1?salary=initial");
    await waitFor(() => expect(search(router).has("add")).toBe(false));
    expect(search(router).get("q")).toBe("asha");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ employeeCode: "EMP-9", firstName: "Asha" });
    expect(JSON.parse(String(post?.[1]?.body))).not.toHaveProperty("intent");
    expect(seen.length).toBeGreaterThanOrEqual(2);
  });

  it("shows a server field error in the dialog and clears it when the dialog is closed", async () => {
    backendWith(twoRows, [], () => json({ error: { code: "DUPLICATE_EMAIL", message: "Email already in use" } }, 409));
    renderAt("/employees?add=1");
    await screen.findByRole("dialog", { name: "Add employee" });

    await fillEmployee();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add employee" }));
    expect(await screen.findByText("Email already in use")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Add employee" }));
    await screen.findByRole("dialog", { name: "Add employee" });
    expect(screen.queryByText("Email already in use")).not.toBeInTheDocument();
  });
});

describe("employees route: status changes", () => {
  const statusBackend = () => {
    const calls: { id: string; status: string }[] = [];
    backendWith(() => list(row(1), row(3, { status: "INACTIVE" })), [], (url, init) => {
      const match = url.pathname.match(/^\/api\/employees\/([^/]+)\/status$/);
      if (match && init?.method === "PATCH") {
        calls.push({ id: match[1], ...JSON.parse(String(init.body)) });
        return json({ employee: { id: match[1] } });
      }
      throw new Error("unexpected");
    });
    return calls;
  };

  it("deactivates after confirmation", async () => {
    const calls = statusBackend();
    renderAt("/employees?status=ALL");
    await screen.findByText("First1 Last1");

    await userEvent.click(screen.getByRole("button", { name: "Actions for First1 Last1" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Deactivate" }));
    const confirm = await screen.findByRole("dialog", { name: "Deactivate employee?" });
    expect(calls).toHaveLength(0);
    await userEvent.click(within(confirm).getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Employee deactivated");
    expect(calls).toEqual([{ id: "e1", status: "INACTIVE" }]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("reactivates without confirmation", async () => {
    const calls = statusBackend();
    renderAt("/employees?status=ALL");
    await screen.findByText("First3 Last3");

    await userEvent.click(screen.getByRole("button", { name: "Actions for First3 Last3" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Reactivate" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Employee activated");
    expect(calls).toEqual([{ id: "e3", status: "ACTIVE" }]);
  });

  it("toasts the error when a status change fails", async () => {
    backendWith(() => list(row(3, { status: "INACTIVE" })), [], () => json({ error: { message: "Not allowed" } }, 400));
    renderAt("/employees?status=INACTIVE");
    await screen.findByText("First3 Last3");

    await userEvent.click(screen.getByRole("button", { name: "Actions for First3 Last3" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Reactivate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not allowed");
  });
});

describe("employees route: action", () => {
  const post = (body: unknown) =>
    action({
      request: new Request("http://localhost:3000/employees", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
      params: {},
      context: {},
    } as Parameters<typeof action>[0]);

  it("rejects an unknown intent", async () => {
    backendWith(() => json(emptyList));
    expect(await post({ intent: "salary" })).toEqual({ intent: "unknown", error: "Unsupported action" });
  });

  it("rejects an invalid status", async () => {
    backendWith(() => json(emptyList));
    expect(await post({ intent: "status", employeeId: "e1", status: "FIRED" })).toEqual({ intent: "status", error: "Invalid status" });
  });
});
