import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import EmployeeProfile, { action, ErrorBoundary, loader } from "./employee-profile";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

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

function stubBackend(handler: Handler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(new URL(String(input)), init),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

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
    expect(
      screen.getByText("Compensation details will be available with the Salary module."),
    ).toBeInTheDocument();
  });

  it("shows a notice for ?notice=created and ?notice=updated, and ignores unknown values", async () => {
    stubBackend(() => json({ employee }));
    renderAt("/employees/e1?notice=created");
    expect(await screen.findByText("Employee created")).toBeInTheDocument();
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
    const dialog = await screen.findByRole("dialog", { name: "Deactivate employee?" });
    expect(patches(fetchMock)).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(patches(fetchMock)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    const dialog2 = await screen.findByRole("dialog", { name: "Deactivate employee?" });
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
    const dialog = await screen.findByRole("dialog", { name: "Deactivate employee?" });
    await user.click(within(dialog).getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByText("Request failed")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Asha Rao" })).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows 'Employee not found' for a backend 404", async () => {
    stubBackend(() => json({ error: { message: "Employee not found", code: "NOT_FOUND" } }, 404));
    renderAt("/employees/e1");

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
