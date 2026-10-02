import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import Salaries, { ErrorBoundary, loader } from "./salaries";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const row = (n: number, withSalary = true) => ({
  employee: {
    id: `e${n}`,
    employeeCode: `EMP-000${n}`,
    firstName: "First" + n,
    lastName: "Last" + n,
    email: `e${n}@example.com`,
    department: { id: "d1", name: "Engineering" },
    country: "IN",
    status: "ACTIVE",
  },
  current: withSalary
    ? { id: `s${n}`, currency: "USD", effectiveDate: "2026-01-01", gross: "5500.00", net: "4800.00", deductions: "700.00", reason: null }
    : null,
  hasScheduled: n === 1,
});

const DEPT_ID = "11111111-1111-4111-8111-111111111111";
const departments = { departments: [{ id: DEPT_ID, name: "Engineering" }] };
const emptyList = { data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };

function backendWith(directory: (url: URL) => Response, seen: URL[] = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/departments") return json(departments);
      seen.push(url);
      return directory(url);
    }),
  );
}

const twoRows = () =>
  json({ data: [row(1), row(2, false)], pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 } });

function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/salaries",
        loader: ({ request }) => loader({ request, params: {}, context: {} } as Parameters<typeof loader>[0]),
        Component: Salaries,
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

describe("salaries route", () => {
  it("lists the directory with heading, amounts, no-salary row and pagination summary", async () => {
    backendWith(twoRows);
    renderAt("/salaries");

    expect(await screen.findByText("EMP-0001")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Salaries" })).toBeInTheDocument();
    const first = screen.getByRole("row", { name: /EMP-0001/ });
    expect(within(first).getByText("$5,500.00")).toBeInTheDocument();
    expect(within(first).getByText("$4,800.00")).toBeInTheDocument();
    expect(within(first).getByText("Scheduled")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /EMP-0002/ })).getAllByText("No salary")).toHaveLength(2);
    expect(screen.getByText("1–2 of 2")).toBeInTheDocument();
  });

  it("sends only non-default params and passes URL params to the API", async () => {
    const seen: URL[] = [];
    backendWith(twoRows, seen);
    renderAt("/salaries?q=asha&status=ALL&salary=without&sortBy=effectiveDate&sortOrder=desc&page=2");

    await screen.findByText("EMP-0001");
    const params = seen[0].searchParams;
    expect(params.get("q")).toBe("asha");
    expect(params.get("status")).toBe("ALL");
    expect(params.get("salary")).toBe("without");
    expect(params.get("sortBy")).toBe("effectiveDate");
    expect(params.get("sortOrder")).toBe("desc");
    expect(params.get("page")).toBe("2");
  });

  it("omits defaults and ignores tampered params", async () => {
    const seen: URL[] = [];
    backendWith(twoRows, seen);
    renderAt("/salaries?sortBy=gross&pageSize=9999&status=FIRED&salary=maybe");

    await screen.findByText("EMP-0001");
    expect(seen[0].search).toBe("");
  });

  it("shows an empty state with a call to action when there are no employees at all", async () => {
    backendWith(() => json(emptyList));
    renderAt("/salaries?status=ACTIVE");

    expect(await screen.findByText("No employees yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add employee" })).toHaveAttribute("href", "/employees/new");
  });

  it("shows a filtered empty state; Clear filters resets filters but keeps sort", async () => {
    backendWith(() => json(emptyList));
    const router = renderAt("/salaries?q=zzz&status=ALL&sortBy=country");

    expect(await screen.findByText("No employees match your filters")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    await waitFor(() => expect(router.state.location.search).not.toContain("q="));
    const search = new URLSearchParams(router.state.location.search);
    expect(search.has("status")).toBe(false);
    expect(search.get("sortBy")).toBe("country");
  });

  it("updates the URL when filters change and resets to page 1", async () => {
    backendWith(twoRows);
    const router = renderAt("/salaries?page=2");
    await screen.findByText("EMP-0001");

    await userEvent.selectOptions(screen.getByLabelText("Salary"), "with");
    await waitFor(() => expect(router.state.location.search).toBe("?salary=with"));
    await userEvent.selectOptions(screen.getByLabelText("Status"), "INACTIVE");
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get("status")).toBe("INACTIVE"));
    expect(new URLSearchParams(router.state.location.search).get("salary")).toBe("with");
  });

  it("keeps both the search text and a department chosen right after typing", async () => {
    backendWith(twoRows);
    const router = renderAt("/salaries");
    await screen.findByText("EMP-0001");

    await userEvent.type(screen.getByLabelText("Search"), "asha");
    await userEvent.selectOptions(screen.getByLabelText("Department"), DEPT_ID);

    await waitFor(() => {
      const search = new URLSearchParams(router.state.location.search);
      expect(search.get("q")).toBe("asha");
      expect(search.get("departmentId")).toBe(DEPT_ID);
    });
  });

  it("sorts by effective date when its header is clicked", async () => {
    backendWith(twoRows);
    const router = renderAt("/salaries");
    await screen.findByText("EMP-0001");

    await userEvent.click(screen.getByText("Effective date"));
    await waitFor(() => expect(router.state.location.search).toContain("sortBy=effectiveDate"));
    await screen.findByText("EMP-0001");
  });

  it("redirects an out-of-range page to the last page", async () => {
    backendWith((url) =>
      url.searchParams.get("page") === "9"
        ? json({ data: [], pagination: { page: 9, pageSize: 20, total: 45, totalPages: 3 } })
        : json({ data: [row(1)], pagination: { page: 3, pageSize: 20, total: 45, totalPages: 3 } }),
    );
    const router = renderAt("/salaries?page=9");

    await waitFor(() => expect(router.state.location.search).toContain("page=3"));
    expect(await screen.findByText("EMP-0001")).toBeInTheDocument();
  });

  it("does not redirect when the last page itself comes back empty", async () => {
    const seen: URL[] = [];
    backendWith(() => json({ data: [], pagination: { page: 3, pageSize: 20, total: 45, totalPages: 3 } }), seen);
    const router = renderAt("/salaries?page=3");

    expect(await screen.findByText("No employees yet")).toBeInTheDocument();
    expect(router.state.location.search).toBe("?page=3");
    expect(seen).toHaveLength(1);
  });

  it("shows the error boundary when the backend fails", async () => {
    backendWith(() => json({ error: { message: "boom" } }, 500));
    renderAt("/salaries");

    expect(await screen.findByText(/Could not load salaries/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/salaries");
  });

  it("redirects to /login when unauthenticated", async () => {
    backendWith(() => json({ error: { message: "Unauthorized" } }, 401));
    renderAt("/salaries");

    expect(await screen.findByText("login page")).toBeInTheDocument();
  });
});
