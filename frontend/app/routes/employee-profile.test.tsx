import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import EmployeeProfile, { action, ErrorBoundary, loader } from "./employee-profile";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const employee = {
  id: "e1",
  employeeCode: "EMP-1",
  firstName: "Asha",
  lastName: "Rao",
  email: "asha@example.com",
  phone: null,
  departmentId: "d1",
  department: { id: "d1", name: "Engineering" },
  designation: "Staff Engineer",
  country: "IN",
  joiningDate: "2024-01-15",
  status: "ACTIVE",
  createdAt: "",
  updatedAt: "",
};
const inactive = { ...employee, status: "INACTIVE" };

type Handler = (url: URL, init: RequestInit | undefined) => Response;

const emptyOverview = { current: null, scheduled: null, history: [] };

/** Routes the salary endpoint to `salaries` (default: empty overview) and everything else to `handler`. */
function stubBackend(handler: Handler, salaries: Handler = () => json(emptyOverview)) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    return url.pathname === "/api/employees/e1/salaries" ? salaries(url, init) : handler(url, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const employeeGets = (fetchMock: ReturnType<typeof stubBackend>) =>
  fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith("/api/employees/e1") && !init?.method);

const patches = (fetchMock: ReturnType<typeof stubBackend>) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");

function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/employees/:id",
        loader: (a) => loader({ ...a, context: {} } as Parameters<typeof loader>[0]),
        action: (a) => action({ ...a, context: {} } as Parameters<typeof action>[0]),
        Component: EmployeeProfile,
        ErrorBoundary,
      },
      { path: "/employees", Component: () => <div>directory</div> },
      { path: "/login", Component: () => <div>login page</div> },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => vi.unstubAllGlobals());

describe("employee profile page", () => {
  it("renders the employee details and links", async () => {
    stubBackend(() => json({ employee }));
    renderAt("/employees/e1");

    expect(await screen.findByRole("heading", { name: "Asha Rao" })).toBeInTheDocument();
    expect(screen.getByText("EMP-1")).toBeInTheDocument();
    expect(screen.getByText("asha@example.com")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("Staff Engineer")).toBeInTheDocument();
    expect(screen.getByText("India")).toBeInTheDocument();
    expect(screen.getByText("2024-01-15")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to employees/ })).toHaveAttribute("href", "/employees");
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/employees/e1/edit");
    expect(screen.getByText("No salary recorded yet.")).toBeInTheDocument();
  });

  it("shows a notice for ?notice=created and ?notice=updated, and ignores unknown values", async () => {
    stubBackend(() => json({ employee }));
    renderAt("/employees/e1?notice=created");
    expect(await screen.findByText("Employee created")).toBeInTheDocument();
  });

  it("strips ?notice from the URL once read, keeping the toast", async () => {
    stubBackend(() => json({ employee }));
    const router = renderAt("/employees/e1?notice=created");
    expect(await screen.findByText("Employee created")).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toBe(""));
    expect(screen.getByText("Employee created")).toBeInTheDocument();
  });

  it("shows the updated notice", async () => {
    stubBackend(() => json({ employee }));
    renderAt("/employees/e1?notice=updated");
    expect(await screen.findByText("Employee updated")).toBeInTheDocument();
  });

  it("shows nothing for an unknown notice", async () => {
    stubBackend(() => json({ employee }));
    renderAt("/employees/e1?notice=bogus");
    await screen.findByRole("heading", { name: "Asha Rao" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/Employee (created|updated)/)).not.toBeInTheDocument();
  });

  it("asks for confirmation before deactivating and sends exactly one PATCH after confirming", async () => {
    const user = userEvent.setup();
    let gets = 0;
    const fetchMock = stubBackend((_url, init) => {
      if (init?.method === "PATCH") return json({ employee: inactive });
      gets += 1;
      return json({ employee: gets === 1 ? employee : inactive });
    });
    renderAt("/employees/e1");

    await user.click(await screen.findByRole("button", { name: "Deactivate" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Deactivate employee?",
    });
    expect(patches(fetchMock)).toHaveLength(0);
    expect(employeeGets(fetchMock)).toHaveLength(1);

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(patches(fetchMock)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    const dialog2 = await screen.findByRole("dialog", {
      name: "Deactivate employee?",
    });
    await user.click(within(dialog2).getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByText("Employee deactivated")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Reactivate" })).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(patches(fetchMock)).toHaveLength(1);
    const [url, init] = patches(fetchMock)[0]!;
    expect(String(url)).toContain("/api/employees/e1/status");
    expect(init?.body).toBe('{"status":"INACTIVE"}');
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("reactivates without a dialog", async () => {
    const user = userEvent.setup();
    let gets = 0;
    const fetchMock = stubBackend((_url, init) => {
      if (init?.method === "PATCH") return json({ employee });
      gets += 1;
      return json({ employee: gets === 1 ? inactive : employee });
    });
    renderAt("/employees/e1");

    await user.click(await screen.findByRole("button", { name: "Reactivate" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText("Employee activated")).toBeInTheDocument();
    expect(patches(fetchMock)).toHaveLength(1);
    expect(patches(fetchMock)[0]![1]?.body).toBe('{"status":"ACTIVE"}');
  });

  it("shows failure feedback and keeps the employee on screen", async () => {
    const user = userEvent.setup();
    stubBackend((_url, init) => (init?.method === "PATCH" ? json({}, 500) : json({ employee })));
    renderAt("/employees/e1");

    await user.click(await screen.findByRole("button", { name: "Deactivate" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Deactivate employee?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByText("Request failed")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("Request failed");
    expect(screen.getByRole("heading", { name: "Asha Rao" })).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows 'Employee not found' for a backend 404", async () => {
    stubBackend(() => json({ error: { message: "Employee not found", code: "NOT_FOUND" } }, 404));
    renderAt("/employees/e1");

    expect(await screen.findByRole("heading", { name: "Employee not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to employees" })).toHaveAttribute("href", "/employees");
  });

  it("treats a backend 400 (malformed id) as not found", async () => {
    stubBackend(() => json({ error: { message: "Invalid id", code: "VALIDATION_ERROR" } }, 400));
    renderAt("/employees/abc");

    expect(await screen.findByRole("heading", { name: "Employee not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to employees" })).toHaveAttribute("href", "/employees");
  });

  it("shows a generic message for other load failures", async () => {
    stubBackend(() => json({}, 500));
    renderAt("/employees/e1");

    expect(await screen.findByText("Could not load this employee.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to employees" })).toBeInTheDocument();
  });

  it("keeps an inactive employee fully viewable and editable", async () => {
    stubBackend(() => json({ employee: inactive }));
    renderAt("/employees/e1");

    expect(await screen.findByRole("heading", { name: "Asha Rao" })).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/employees/e1/edit");
  });
});

const salary = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  employeeId: "e1",
  currency: "USD",
  effectiveDate: "2025-06-01",
  reason: null,
  createdAt: "",
  createdBy: { id: "u1", name: "Hana HR" },
  components: [{ id: "c1", type: "BASE", name: "Base salary", amount: "5000.00" }],
  totals: { gross: "5000.00", deductions: "0.00", net: "5000.00" },
  changeFromPrevious: null,
  status: "CURRENT",
  ...over,
});
const populated = { current: salary(), scheduled: null, history: [salary()] };
const revised = salary({
  id: "s2",
  effectiveDate: "2026-12-01",
  reason: "Annual review",
  components: [{ id: "c2", type: "BASE", name: "Base salary", amount: "6000.00" }],
  totals: { gross: "6000.00", deductions: "0.00", net: "6000.00" },
});
const salaryPosts = (fetchMock: ReturnType<typeof stubBackend>) =>
  fetchMock.mock.calls.filter(([url, init]) => init?.method === "POST" && String(url).endsWith("/salaries"));

describe("employee profile compensation", () => {
  const backend = (salaries: Handler) => stubBackend(() => json({ employee }), salaries);

  it("renders the current net and history rows", async () => {
    backend(() => json(populated));
    renderAt("/employees/e1");

    expect(await screen.findByRole("heading", { name: "Compensation" })).toBeInTheDocument();
    expect(within(screen.getByTestId("current-salary")).getByText("Net")).toBeInTheDocument();
    const rows = within(screen.getByRole("table", { name: "Salary history" })).getAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent("2025-06-01");
    expect(rows[1]).toHaveTextContent("$5,000.00");
  });

  it("keeps the profile when the salary API fails with 500", async () => {
    backend(() => json({}, 500));
    renderAt("/employees/e1");

    expect(await screen.findByRole("heading", { name: "Asha Rao" })).toBeInTheDocument();
    expect(await screen.findByText("Could not load compensation.")).toBeInTheDocument();
  });

  it("hides compensation when the salary API returns 403", async () => {
    backend(() => json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403));
    renderAt("/employees/e1");

    expect(await screen.findByRole("heading", { name: "Asha Rao" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Compensation" })).not.toBeInTheDocument();
    expect(screen.queryByText("Could not load compensation.")).not.toBeInTheDocument();
  });

  it("redirects to /login when the salary API returns 401", async () => {
    backend(() => json({}, 401));
    const router = renderAt("/employees/e1");

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });

  it("sets an initial salary through the dialog and shows the toast", async () => {
    const user = userEvent.setup();
    let saved = false;
    const fetchMock = backend((_url, init) => {
      if (init?.method === "POST") {
        saved = true;
        return json({ salary: salary() }, 201);
      }
      return json(saved ? populated : emptyOverview);
    });
    renderAt("/employees/e1");

    await user.click(await screen.findByRole("button", { name: "Set salary" }));
    const dialog = await screen.findByRole("dialog", { name: "Set salary" });
    await user.selectOptions(within(dialog).getByLabelText("Currency"), "USD");
    await user.type(within(dialog).getByLabelText("Effective date"), "2026-03-01");
    await user.type(within(dialog).getByLabelText("Base salary"), "5000");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Salary saved")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(salaryPosts(fetchMock)).toHaveLength(1);
    const [, init] = salaryPosts(fetchMock)[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({
      currency: "USD",
      effectiveDate: "2026-03-01",
      components: [{ type: "BASE", name: "Base salary", amount: "5000" }],
    });
    expect(await screen.findByRole("table", { name: "Salary history" })).toBeInTheDocument();
  });

  it("revises a salary only after confirmation and reloads history", async () => {
    const user = userEvent.setup();
    let saved = false;
    const fetchMock = backend((_url, init) => {
      if (init?.method === "POST") {
        saved = true;
        return json({ salary: revised }, 201);
      }
      return json(
        saved
          ? {
              current: salary(),
              scheduled: revised,
              history: [revised, salary()],
            }
          : populated,
      );
    });
    renderAt("/employees/e1");

    await user.click(await screen.findByRole("button", { name: "Revise salary" }));
    const dialog = await screen.findByRole("dialog", { name: "Revise salary" });
    await user.type(within(dialog).getByLabelText("Effective date"), "2026-12-01");
    await user.type(within(dialog).getByLabelText("Reason"), "Annual review");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    const confirm = await screen.findByRole("dialog", {
      name: "Save salary revision?",
    });
    expect(salaryPosts(fetchMock)).toHaveLength(0);
    await user.click(within(confirm).getByRole("button", { name: "Save revision" }));

    expect(await screen.findByText("Salary saved")).toBeInTheDocument();
    expect(salaryPosts(fetchMock)).toHaveLength(1);
    expect(JSON.parse(String(salaryPosts(fetchMock)[0]![1]?.body))).toMatchObject({
      effectiveDate: "2026-12-01",
      reason: "Annual review",
    });
    await waitFor(() =>
      expect(within(screen.getByRole("table", { name: "Salary history" })).getAllByRole("row")).toHaveLength(3),
    );
  });

  it("keeps the dialog open and shows the server message under the date field on 409", async () => {
    const user = userEvent.setup();
    backend((_url, init) =>
      init?.method === "POST"
        ? json(
            {
              error: {
                message: "Effective date must be after 2025-06-01",
                code: "EFFECTIVE_DATE_NOT_AFTER_LATEST",
              },
            },
            409,
          )
        : json(emptyOverview),
    );
    renderAt("/employees/e1");

    await user.click(await screen.findByRole("button", { name: "Set salary" }));
    const dialog = await screen.findByRole("dialog", { name: "Set salary" });
    await user.type(within(dialog).getByLabelText("Effective date"), "2026-03-01");
    await user.type(within(dialog).getByLabelText("Base salary"), "5000");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText("Effective date must be after 2025-06-01")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Set salary" })).toBeInTheDocument();
    expect(screen.queryByText("Salary saved")).not.toBeInTheDocument();
  });

  it("clears the server error when the dialog is closed and reopened", async () => {
    const user = userEvent.setup();
    backend((_url, init) =>
      init?.method === "POST"
        ? json(
            {
              error: {
                message: "Effective date must be after 2025-06-01",
                code: "EFFECTIVE_DATE_NOT_AFTER_LATEST",
              },
            },
            409,
          )
        : json(emptyOverview),
    );
    renderAt("/employees/e1");

    await user.click(await screen.findByRole("button", { name: "Set salary" }));
    const dialog = await screen.findByRole("dialog", { name: "Set salary" });
    await user.type(within(dialog).getByLabelText("Effective date"), "2026-03-01");
    await user.type(within(dialog).getByLabelText("Base salary"), "5000");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await within(dialog).findByText("Effective date must be after 2025-06-01");

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Set salary" }));
    await screen.findByRole("dialog", { name: "Set salary" });
    expect(screen.queryByText("Effective date must be after 2025-06-01")).not.toBeInTheDocument();
  });

  it("offers no salary actions for an inactive employee", async () => {
    stubBackend(
      () => json({ employee: inactive }),
      () => json(populated),
    );
    renderAt("/employees/e1");

    expect(await screen.findByRole("heading", { name: "Compensation" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set salary" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revise salary" })).not.toBeInTheDocument();
    expect(screen.getByText("Inactive employees cannot receive salary changes.")).toBeInTheDocument();
  });
});

describe("employee profile action", () => {
  const call = (status: string) =>
    action({
      request: new Request("http://localhost:3000/employees/e1", {
        method: "POST",
        body: new URLSearchParams({ status }),
        headers: { cookie: "session=abc" },
      }),
      params: { id: "e1" },
      context: {},
    } as Parameters<typeof action>[0]);

  it("deactivates via the status endpoint with the forwarded cookie", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ employee: inactive }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await call("INACTIVE")).toEqual({ message: "Employee deactivated" });

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain("/api/employees/e1/status");
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe('{"status":"INACTIVE"}');
    expect((init.headers as Record<string, string>).cookie).toBe("session=abc");
  });

  it("rejects an invalid status without calling the backend", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await call("FIRED")).toEqual({ error: "Invalid status" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the backend message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ error: { message: "Employee not found", code: "NOT_FOUND" } }, 404)),
    );
    expect(await call("ACTIVE")).toEqual({ error: "Employee not found" });
  });
});
