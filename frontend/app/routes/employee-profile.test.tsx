import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "~/components/common/ToastProvider";
import EmployeeProfile, { action, ErrorBoundary, loader, shouldRevalidate } from "./employee-profile";

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
const departments = { departments: [{ id: "d1", name: "Engineering" }] };

type Handler = (url: URL, init: RequestInit | undefined) => Response;

const emptyOverview = { current: null, scheduled: null, history: [] };

/**
 * Routes the salary endpoint to `salaries` (default: empty overview), departments to a fixture,
 * and everything else to `handler`.
 */
function stubBackend(handler: Handler, salaries: Handler = () => json(emptyOverview)) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/departments") return json(departments);
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
        shouldRevalidate,
        Component: () => (
          <ToastProvider>
            <EmployeeProfile />
          </ToastProvider>
        ),
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

const search = (router: ReturnType<typeof renderAt>) => new URLSearchParams(router.state.location.search);

async function openMenuItem(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("button", { name: "More actions" }));
  await user.click(await screen.findByRole("menuitem", { name }));
}

afterEach(() => vi.unstubAllGlobals());

describe("employee profile page", () => {
  it("shows a header with breadcrumb, initials avatar, status chip and role line", async () => {
    stubBackend(() => json({ employee }));
    renderAt("/employees/e1");

    expect(await screen.findByRole("heading", { level: 1, name: "Asha Rao" })).toBeInTheDocument();
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByRole("link", { name: "Employees" })).toHaveAttribute("href", "/employees");
    expect(within(crumbs).getByText("Asha Rao")).toBeInTheDocument();
    expect(within(crumbs).queryByRole("link", { name: "Asha Rao" })).not.toBeInTheDocument();
    expect(screen.getByText("AR")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Staff Engineer · Engineering · India")).toBeInTheDocument();
  });

  it("selects the Overview tab by default and shows contact and employment details", async () => {
    stubBackend(() => json({ employee }));
    renderAt("/employees/e1");

    expect(await screen.findByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Compensation" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("heading", { name: "Contact" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Employment" })).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("asha@example.com")).toBeInTheDocument();
    expect(screen.getByText("Phone")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Joining date")).toBeInTheDocument();
    expect(screen.getByText("2024-01-15")).toBeInTheDocument();
    expect(screen.getByText("EMP-1")).toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("Staff Engineer")).toBeInTheDocument();
    expect(screen.getByText("India")).toBeInTheDocument();
  });

  it("shows the current salary card on the Compensation tab", async () => {
    const user = userEvent.setup();
    stubBackend(
      () => json({ employee }),
      () => json(populated),
    );
    renderAt("/employees/e1");

    await user.click(await screen.findByRole("tab", { name: "Compensation" }));
    expect(screen.getByRole("tab", { name: "Compensation" })).toHaveAttribute("aria-selected", "true");
    expect(within(screen.getByTestId("current-salary")).getByText("Net")).toBeInTheDocument();
    expect(screen.queryByText("asha@example.com")).not.toBeInTheDocument();
  });

  it("opens the edit dialog from ?edit=1 with Employee ID locked, and Cancel removes only edit from the URL", async () => {
    const user = userEvent.setup();
    stubBackend(() => json({ employee }));
    const router = renderAt("/employees/e1?edit=1&tab=x");

    const dialog = await screen.findByRole("dialog", { name: "Edit employee" });
    expect(within(dialog).getByLabelText("Employee ID")).toBeDisabled();
    expect(within(dialog).getByLabelText("Employee ID")).toHaveValue("EMP-1");
    expect(within(dialog).getByLabelText("First name")).toHaveValue("Asha");
    expect(within(dialog).getByLabelText("Department")).toHaveValue("d1");

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(search(router).has("edit")).toBe(false);
    expect(search(router).get("tab")).toBe("x");
  });

  it("opens the edit dialog from the Edit button", async () => {
    const user = userEvent.setup();
    stubBackend(() => json({ employee }));
    const router = renderAt("/employees/e1");

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("dialog", { name: "Edit employee" })).toBeInTheDocument();
    expect(search(router).get("edit")).toBe("1");
  });

  it("saves an update without the employee code, toasts and closes the dialog", async () => {
    const user = userEvent.setup();
    let gets = 0;
    const fetchMock = stubBackend((_url, init) => {
      if (init?.method === "PATCH") return json({ employee: { ...employee, firstName: "Ashu" } });
      gets += 1;
      return json({ employee: gets === 1 ? employee : { ...employee, firstName: "Ashu" } });
    });
    const router = renderAt("/employees/e1?edit=1");

    const dialog = await screen.findByRole("dialog", { name: "Edit employee" });
    const first = within(dialog).getByLabelText("First name");
    await user.clear(first);
    await user.type(first, "Ashu");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Employee updated")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(search(router).has("edit")).toBe(false);
    expect(await screen.findByRole("heading", { level: 1, name: "Ashu Rao" })).toBeInTheDocument();
    expect(patches(fetchMock)).toHaveLength(1);
    const [url, init] = patches(fetchMock)[0]!;
    expect(String(url)).toMatch(/\/api\/employees\/e1$/);
    const sent = JSON.parse(String(init?.body));
    expect(sent).not.toHaveProperty("employeeCode");
    expect(sent).not.toHaveProperty("intent");
    expect(sent).toMatchObject({ firstName: "Ashu", email: "asha@example.com" });
  });

  it("shows a duplicate email error under the field and clears it when the dialog is closed", async () => {
    const user = userEvent.setup();
    stubBackend((_url, init) =>
      init?.method === "PATCH"
        ? json({ error: { message: "Email already in use", code: "DUPLICATE_EMAIL" } }, 409)
        : json({ employee }),
    );
    renderAt("/employees/e1?edit=1");

    const dialog = await screen.findByRole("dialog", { name: "Edit employee" });
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect(await within(dialog).findByText("Email already in use")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Work email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("Employee updated")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const reopened = await screen.findByRole("dialog", { name: "Edit employee" });
    expect(within(reopened).queryByText("Email already in use")).not.toBeInTheDocument();
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

    await openMenuItem(user, "Deactivate");
    const dialog = await screen.findByRole("dialog", { name: "Deactivate employee?" });
    expect(patches(fetchMock)).toHaveLength(0);
    expect(employeeGets(fetchMock)).toHaveLength(1);

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(patches(fetchMock)).toHaveLength(0);

    await openMenuItem(user, "Deactivate");
    const dialog2 = await screen.findByRole("dialog", { name: "Deactivate employee?" });
    await user.click(within(dialog2).getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByText("Employee deactivated")).toBeInTheDocument();
    expect(await screen.findByText("Inactive")).toBeInTheDocument();
    expect(patches(fetchMock)).toHaveLength(1);
    const [url, init] = patches(fetchMock)[0]!;
    expect(String(url)).toContain("/api/employees/e1/status");
    expect(init?.body).toBe('{"status":"INACTIVE"}');
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(await screen.findByRole("menuitem", { name: "Reactivate" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("reactivates without a confirmation dialog", async () => {
    const user = userEvent.setup();
    let gets = 0;
    const fetchMock = stubBackend((_url, init) => {
      if (init?.method === "PATCH") return json({ employee });
      gets += 1;
      return json({ employee: gets === 1 ? inactive : employee });
    });
    renderAt("/employees/e1");

    await openMenuItem(user, "Reactivate");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText("Employee activated")).toBeInTheDocument();
    expect(patches(fetchMock)).toHaveLength(1);
    expect(patches(fetchMock)[0]![1]?.body).toBe('{"status":"ACTIVE"}');
  });

  it("shows failure feedback and keeps the employee on screen", async () => {
    const user = userEvent.setup();
    stubBackend((_url, init) => (init?.method === "PATCH" ? json({}, 500) : json({ employee })));
    renderAt("/employees/e1");

    await openMenuItem(user, "Deactivate");
    const dialog = await screen.findByRole("dialog", { name: "Deactivate employee?" });
    await user.click(within(dialog).getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByText("Request failed")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("Request failed");
    expect(screen.getByRole("heading", { level: 1, name: "Asha Rao" })).toBeInTheDocument();
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

    expect(await screen.findByRole("heading", { level: 1, name: "Asha Rao" })).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("does not refetch the profile when only dialog params change", async () => {
    const user = userEvent.setup();
    const fetchMock = stubBackend(() => json({ employee }));
    renderAt("/employees/e1");

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit employee" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(employeeGets(fetchMock)).toHaveLength(1);
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

describe("employee profile salary dialog from the URL", () => {
  const backend = (overview: unknown, emp: unknown = employee) =>
    stubBackend(
      () => json({ employee: emp }),
      () => json(overview),
    );

  it("?salary=revise opens the revise dialog prefilled from the latest record", async () => {
    backend(populated);
    renderAt("/employees/e1?salary=revise");

    const dialog = await screen.findByRole("dialog", { name: "Revise salary" });
    expect(within(dialog).getByLabelText("Base salary")).toHaveValue("5000.00");
  });

  it("?salary=initial opens the set salary dialog", async () => {
    backend(emptyOverview);
    renderAt("/employees/e1?salary=initial");

    const dialog = await screen.findByRole("dialog", { name: "Set salary" });
    expect(within(dialog).getByLabelText("Base salary")).toHaveValue("");
  });

  it("?salary=revise without any salary falls back to the set salary dialog", async () => {
    backend(emptyOverview);
    renderAt("/employees/e1?salary=revise");

    expect(await screen.findByRole("dialog", { name: "Set salary" })).toBeInTheDocument();
  });

  it("?salary=initial when a salary already exists opens the revise dialog", async () => {
    backend(populated);
    renderAt("/employees/e1?salary=initial");

    expect(await screen.findByRole("dialog", { name: "Revise salary" })).toBeInTheDocument();
  });

  it("closing removes only the salary param and does not reopen the dialog", async () => {
    const user = userEvent.setup();
    backend(populated);
    const router = renderAt("/employees/e1?salary=revise&tab=x");

    const dialog = await screen.findByRole("dialog", { name: "Revise salary" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(search(router).has("salary")).toBe(false);
    expect(search(router).get("tab")).toBe("x");
    // Give any stray effect a chance to reopen it.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("the header Set salary button opens the dialog through ?salary=initial", async () => {
    const user = userEvent.setup();
    backend(emptyOverview);
    const router = renderAt("/employees/e1?tab=x");

    await user.click(await screen.findByRole("button", { name: "Set salary" }));
    expect(await screen.findByRole("dialog", { name: "Set salary" })).toBeInTheDocument();
    expect(search(router).get("salary")).toBe("initial");
    expect(search(router).get("tab")).toBe("x");

    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(search(router).has("salary")).toBe(false);

    // Reopening after a close works again.
    await user.click(screen.getByRole("button", { name: "Set salary" }));
    expect(await screen.findByRole("dialog", { name: "Set salary" })).toBeInTheDocument();
    expect(search(router).get("salary")).toBe("initial");
  });

  it("the header Revise salary button opens the dialog through ?salary=revise", async () => {
    const user = userEvent.setup();
    backend(populated);
    const router = renderAt("/employees/e1");

    await user.click(await screen.findByRole("button", { name: "Revise salary" }));
    expect(await screen.findByRole("dialog", { name: "Revise salary" })).toBeInTheDocument();
    expect(search(router).get("salary")).toBe("revise");
  });

  it("opens only the edit dialog when both ?edit=1 and ?salary= are present", async () => {
    backend(populated);
    const router = renderAt("/employees/e1?edit=1&salary=revise");

    expect(await screen.findByRole("dialog", { name: "Edit employee" })).toBeInTheDocument();
    await waitFor(() => expect(search(router).has("salary")).toBe(false));
    expect(search(router).get("edit")).toBe("1");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("strips an unrecognised ?salary value without opening anything", async () => {
    backend(populated);
    const router = renderAt("/employees/e1?salary=bogus");

    expect(await screen.findByRole("heading", { level: 1, name: "Asha Rao" })).toBeInTheDocument();
    await waitFor(() => expect(search(router).has("salary")).toBe(false));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ignores ?salary for an inactive employee and offers no salary buttons", async () => {
    const user = userEvent.setup();
    backend(populated, inactive);
    renderAt("/employees/e1?salary=revise");

    expect(await screen.findByRole("heading", { level: 1, name: "Asha Rao" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revise salary" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set salary" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Compensation" }));
    expect(screen.getByText("Inactive employees cannot receive salary changes.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revise salary" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set salary" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers no salary buttons for an inactive employee without salary", async () => {
    backend(emptyOverview, inactive);
    renderAt("/employees/e1?salary=initial");

    expect(await screen.findByRole("heading", { level: 1, name: "Asha Rao" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set salary" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("employee profile compensation", () => {
  const backend = (salaries: Handler) => stubBackend(() => json({ employee }), salaries);

  it("renders the current net and history rows", async () => {
    const user = userEvent.setup();
    backend(() => json(populated));
    renderAt("/employees/e1");

    await user.click(await screen.findByRole("tab", { name: "Compensation" }));
    expect(within(screen.getByTestId("current-salary")).getByText("Net")).toBeInTheDocument();
    const rows = within(screen.getByRole("table", { name: "Salary history" })).getAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent("2025-06-01");
    expect(rows[1]).toHaveTextContent("$5,000.00");
  });

  it("keeps the profile when the salary API fails with 500", async () => {
    const user = userEvent.setup();
    backend(() => json({}, 500));
    renderAt("/employees/e1");

    expect(await screen.findByRole("heading", { level: 1, name: "Asha Rao" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set salary" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Compensation" }));
    expect(await screen.findByText("Could not load compensation.")).toBeInTheDocument();
  });

  it("hides compensation when the salary API returns 403", async () => {
    backend(() => json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403));
    renderAt("/employees/e1");

    expect(await screen.findByRole("heading", { level: 1, name: "Asha Rao" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Compensation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set salary" })).not.toBeInTheDocument();
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
    // Opening the salary dialog switches to the Compensation tab so the result is visible.
    expect(screen.getByRole("tab", { name: "Compensation" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("table", { name: "Salary history" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revise salary" })).toBeInTheDocument();
  });

  it("revises a salary only after confirmation and reloads history", async () => {
    const user = userEvent.setup();
    let saved = false;
    const fetchMock = backend((_url, init) => {
      if (init?.method === "POST") {
        saved = true;
        return json({ salary: revised }, 201);
      }
      return json(saved ? { current: salary(), scheduled: revised, history: [revised, salary()] } : populated);
    });
    renderAt("/employees/e1");

    await user.click(await screen.findByRole("button", { name: "Revise salary" }));
    const dialog = await screen.findByRole("dialog", { name: "Revise salary" });
    await user.type(within(dialog).getByLabelText("Effective date"), "2026-12-01");
    await user.type(within(dialog).getByLabelText("Reason"), "Annual review");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    const confirm = await screen.findByRole("dialog", { name: "Save salary revision?" });
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

  it("revises a scheduled-only history, prefilled from the future record", async () => {
    const user = userEvent.setup();
    const future = salary({
      id: "s9",
      effectiveDate: "2026-12-01",
      status: "SCHEDULED",
      components: [{ id: "c9", type: "BASE", name: "Base salary", amount: "7000.00" }],
      totals: { gross: "7000.00", deductions: "0.00", net: "7000.00" },
    });
    backend(() => json({ current: null, scheduled: future, history: [future] }));
    renderAt("/employees/e1");

    await user.click(await screen.findByRole("button", { name: "Revise salary" }));
    expect(screen.queryByRole("button", { name: "Set salary" })).not.toBeInTheDocument();
    const dialog = await screen.findByRole("dialog", { name: "Revise salary" });
    expect(within(dialog).getByLabelText("Base salary")).toHaveValue("7000.00");
    expect(within(dialog).getByLabelText("Effective date")).toHaveAttribute("min", "2026-12-02");
  });

  it("prefills the revise form from the latest record, not the current one", async () => {
    const user = userEvent.setup();
    const april = salary({
      id: "s8",
      effectiveDate: "2026-12-01",
      status: "SCHEDULED",
      components: [{ id: "c8", type: "BASE", name: "Base salary", amount: "6000.00" }],
      totals: { gross: "6000.00", deductions: "0.00", net: "6000.00" },
    });
    backend(() => json({ current: salary(), scheduled: april, history: [april, salary()] }));
    renderAt("/employees/e1");

    await user.click(await screen.findByRole("button", { name: "Revise salary" }));
    const dialog = await screen.findByRole("dialog", { name: "Revise salary" });
    expect(within(dialog).getByLabelText("Base salary")).toHaveValue("6000.00");
  });

  const conflict = () =>
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

  it("keeps the dialog open and shows the server message under the date field on 409", async () => {
    const user = userEvent.setup();
    conflict();
    renderAt("/employees/e1");

    await user.click(await screen.findByRole("button", { name: "Set salary" }));
    const dialog = await screen.findByRole("dialog", { name: "Set salary" });
    await user.type(within(dialog).getByLabelText("Effective date"), "2026-03-01");
    await user.type(within(dialog).getByLabelText("Base salary"), "5000");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText("Effective date must be after 2025-06-01")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Effective date")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("dialog", { name: "Set salary" })).toBeInTheDocument();
    expect(screen.queryByText("Salary saved")).not.toBeInTheDocument();
  });

  it("clears the server error when the dialog is closed and reopened", async () => {
    const user = userEvent.setup();
    conflict();
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
});

describe("employee profile loader", () => {
  const args = () =>
    ({
      request: new Request("http://localhost:3000/employees/e1", { headers: { cookie: "session=abc" } }),
      params: { id: "e1" },
      context: {},
    }) as Parameters<typeof loader>[0];

  it("returns the employee, salaries and departments", async () => {
    stubBackend(() => json({ employee }));
    const data = await loader(args());
    expect(data.employee).toEqual(employee);
    expect(data.departments).toEqual(departments.departments);
    expect(data.salaries).toEqual({ ok: true, data: emptyOverview });
  });

  it("falls back to the employee's own department when departments cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(String(input)).pathname;
        if (path === "/api/departments") return json({}, 500);
        if (path === "/api/employees/e1/salaries") return json(emptyOverview);
        return json({ employee });
      }),
    );
    expect((await loader(args())).departments).toEqual([{ id: "d1", name: "Engineering" }]);
  });
});

describe("employee profile action", () => {
  const call = (body: unknown) =>
    action({
      request: new Request("http://localhost:3000/employees/e1", {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body),
        headers: { cookie: "session=abc", "content-type": "application/json" },
      }),
      params: { id: "e1" },
      context: {},
    } as Parameters<typeof action>[0]);

  it("deactivates via the status endpoint with the forwarded cookie", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ employee: inactive }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await call({ intent: "status", status: "INACTIVE" })).toEqual({
      intent: "status",
      message: "Employee deactivated",
    });

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain("/api/employees/e1/status");
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe('{"status":"INACTIVE"}');
    expect((init.headers as Record<string, string>).cookie).toBe("session=abc");
  });

  it("activates with the activated message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ employee })));
    expect(await call({ intent: "status", status: "ACTIVE" })).toEqual({
      intent: "status",
      message: "Employee activated",
    });
  });

  it("rejects an invalid status without calling the backend", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await call({ intent: "status", status: "FIRED" })).toEqual({ intent: "status", error: "Invalid status" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the backend message on status failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ error: { message: "Employee not found", code: "NOT_FOUND" } }, 404)),
    );
    expect(await call({ intent: "status", status: "ACTIVE" })).toEqual({
      intent: "status",
      error: "Employee not found",
    });
  });

  const values = {
    employeeCode: "EMP-1",
    firstName: "Asha",
    lastName: "Rao",
    email: "asha@example.com",
    phone: "",
    departmentId: "d1",
    designation: "Engineer",
    country: "IN",
    joiningDate: "2024-01-15",
  };

  it("update strips employeeCode and intent, PATCHes, and returns the updated message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ employee }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await call({ intent: "update", ...values })).toEqual({ intent: "update", message: "Employee updated" });
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toMatch(/\/api\/employees\/e1$/);
    expect(init.method).toBe("PATCH");
    const { employeeCode: _code, ...expected } = values;
    expect(JSON.parse(init.body as string)).toEqual(expected);
  });

  it("update maps DUPLICATE_EMAIL to the email field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ error: { message: "Taken", code: "DUPLICATE_EMAIL" } }, 409)),
    );
    expect(await call({ intent: "update", ...values })).toEqual({
      intent: "update",
      error: { message: "Taken", field: "email" },
    });
  });

  it("update returns a form-level error for a 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ error: { message: "Employee not found", code: "NOT_FOUND" } }, 404)),
    );
    expect(await call({ intent: "update", ...values })).toEqual({
      intent: "update",
      error: { message: "Employee not found" },
    });
  });

  it("salary posts the payload and returns Salary saved", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ salary: salary() }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const body = { currency: "USD", effectiveDate: "2026-12-01", reason: "", baseAmount: "5000", extras: [] };

    expect(await call({ intent: "salary", ...body })).toEqual({ intent: "salary", message: "Salary saved" });
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain("/api/employees/e1/salaries");
    expect(JSON.parse(init.body as string)).toEqual({
      currency: "USD",
      effectiveDate: "2026-12-01",
      components: [{ type: "BASE", name: "Base salary", amount: "5000" }],
    });
  });

  it("salary maps a backend field error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json({ error: { message: "Too early", code: "EFFECTIVE_DATE_NOT_AFTER_LATEST" } }, 409),
      ),
    );
    const body = { currency: "USD", effectiveDate: "2026-12-01", reason: "", baseAmount: "5000", extras: [] };
    expect(await call({ intent: "salary", ...body })).toEqual({
      intent: "salary",
      error: { message: "Too early", field: "effectiveDate" },
    });
  });

  it("returns Invalid salary data for a salary body missing reason or extras", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const partial = { intent: "salary", currency: "USD", effectiveDate: "2026-12-01", baseAmount: "5000" };
    const invalid = { intent: "salary", error: { message: "Invalid salary data" } };
    expect(await call(partial)).toEqual(invalid);
    expect(await call({ ...partial, reason: "x" })).toEqual(invalid);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON, null and unknown intents without calling the backend", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const unsupported = { intent: "unknown", error: "Unsupported action" };
    expect(await call("{not json")).toEqual(unsupported);
    expect(await call("null")).toEqual(unsupported);
    expect(await call({ intent: "explode" })).toEqual(unsupported);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("employee profile inside a parent route with a loader", () => {
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Mirrors routes/authenticated.tsx: a parent layout whose loader reruns on every navigation. */
  function renderNested(url: string) {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          loader: async () => ({ user: "hr" }),
          Component: () => (
            <ToastProvider>
              <Outlet />
            </ToastProvider>
          ),
          children: [
            {
              path: "employees/:id",
              loader: (a) => loader({ ...a, context: {} } as Parameters<typeof loader>[0]),
              action: (a) => action({ ...a, context: {} } as Parameters<typeof action>[0]),
              shouldRevalidate,
              Component: EmployeeProfile,
              ErrorBoundary,
            },
          ],
        },
      ],
      { initialEntries: [url] },
    );
    render(<RouterProvider router={router} />);
    return router;
  }

  /** Profile GETs are slow (after the first load) so the parent loader always finishes first. */
  function slowBackend(employeeFor: () => unknown, overviewFor: () => unknown, onWrite: () => Response) {
    let loads = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/departments") return json(departments);
      if (init?.method) return onWrite();
      if (url.pathname === "/api/employees/e1") {
        loads += 1;
        if (loads > 1) await delay(80);
        return json({ employee: employeeFor() });
      }
      if (loads > 1) await delay(80);
      return json(overviewFor());
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("shows the updated name after saving the edit dialog", async () => {
    const user = userEvent.setup();
    let updated = false;
    slowBackend(
      () => (updated ? { ...employee, firstName: "Ashu" } : employee),
      () => emptyOverview,
      () => {
        updated = true;
        return json({ employee: { ...employee, firstName: "Ashu" } });
      },
    );
    const router = renderNested("/employees/e1?edit=1");

    const dialog = await screen.findByRole("dialog", { name: "Edit employee" });
    const first = within(dialog).getByLabelText("First name");
    await user.clear(first);
    await user.type(first, "Ashu");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Employee updated")).toBeInTheDocument();
    await waitFor(() => expect(search(router).has("edit")).toBe(false));
    expect(await screen.findByRole("heading", { level: 1, name: "Ashu Rao" }, { timeout: 2000 })).toBeInTheDocument();
    await delay(200);
    expect(screen.getByRole("heading", { level: 1, name: "Ashu Rao" })).toBeInTheDocument();
  });

  it("shows the new history row after saving from ?salary=revise", async () => {
    const user = userEvent.setup();
    let saved = false;
    slowBackend(
      () => employee,
      () => (saved ? { current: salary(), scheduled: revised, history: [revised, salary()] } : populated),
      () => {
        saved = true;
        return json({ salary: revised }, 201);
      },
    );
    const router = renderNested("/employees/e1?salary=revise");

    const dialog = await screen.findByRole("dialog", { name: "Revise salary" });
    await user.type(within(dialog).getByLabelText("Effective date"), "2026-12-01");
    await user.type(within(dialog).getByLabelText("Reason"), "Annual review");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    const confirm = await screen.findByRole("dialog", { name: "Save salary revision?" });
    await user.click(within(confirm).getByRole("button", { name: "Save revision" }));

    expect(await screen.findByText("Salary saved")).toBeInTheDocument();
    await waitFor(() => expect(search(router).has("salary")).toBe(false));
    await waitFor(
      () => expect(within(screen.getByRole("table", { name: "Salary history" })).getAllByRole("row")).toHaveLength(3),
      { timeout: 2000 },
    );
    await delay(200);
    expect(within(screen.getByRole("table", { name: "Salary history" })).getAllByRole("row")).toHaveLength(3);
  });
});
