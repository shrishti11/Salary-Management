import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTHENTICATED_ROUTE_ID } from "~/lib/route-ids";
import Dashboard, { ErrorBoundary, loader } from "./dashboard";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const dashboard = {
  asOf: "2026-10-03",
  metrics: {
    totalEmployees: 8,
    activeEmployees: 7,
    departmentCount: 2,
    countryCount: 3,
    withoutSalary: 2,
    currencies: [
      { currency: "USD", count: 4, total: "11200.00", average: "2800.00", median: "2750.00", min: "1300.00", max: "4400.00", p25: "2200.00", p75: "3350.00" },
      { currency: "INR", count: 1, total: "120000.00", average: "120000.00", median: "120000.00", min: "120000.00", max: "120000.00", p25: "120000.00", p75: "120000.00" },
    ],
  },
  departments: [
    { id: "d2", name: "Engineering", headcount: 4, currencies: [{ currency: "USD", count: 1, total: "4400.00", average: "4400.00" }, { currency: "INR", count: 1, total: "120000.00", average: "120000.00" }] },
    { id: "d1", name: "Design", headcount: 3, currencies: [{ currency: "USD", count: 3, total: "6800.00", average: "2266.67" }] },
  ],
  countries: [
    { country: "US", headcount: 4, currencies: [{ currency: "USD", count: 3, total: "6800.00", average: "2266.67" }] },
    { country: "ZZ", headcount: 1, currencies: [] },
  ],
  recentEmployees: [{ id: "e1", employeeCode: "EMP-0009", name: "Asha Rao", department: "Design", joiningDate: "2026-09-01", createdAt: "2026-10-02T10:00:00.000Z" }],
  recentRevisions: [{ id: "s1", employee: { id: "e1", employeeCode: "EMP-0001", name: "Asha Rao" }, currency: "USD", effectiveDate: "2026-10-01", gross: "1300.00", changePercent: "30.00", reason: "Annual review", createdBy: { id: "u1", name: "Hannah HR" }, createdAt: "2026-10-02T11:00:00.000Z" }],
};

const empty = {
  asOf: "2026-10-03",
  metrics: { totalEmployees: 0, activeEmployees: 0, departmentCount: 0, countryCount: 0, withoutSalary: 0, currencies: [] },
  departments: [],
  countries: [],
  recentEmployees: [],
  recentRevisions: [],
};

function renderDashboard(respond: () => Response) {
  vi.stubGlobal("fetch", vi.fn(async () => respond()));
  const router = createMemoryRouter(
    [
      {
        id: AUTHENTICATED_ROUTE_ID,
        path: "/",
        loader: () => ({ user: { id: "1", email: "a@b.com", name: "Alice", role: "ADMIN" } }),
        children: [
          {
            path: "dashboard",
            loader: ({ request }) => loader({ request, params: {}, context: {} } as Parameters<typeof loader>[0]),
            Component: Dashboard,
            ErrorBoundary,
          },
        ],
      },
      { path: "/login", Component: () => <div>login page</div> },
    ],
    { initialEntries: ["/dashboard"] },
  );
  render(<RouterProvider router={router} />);
}

afterEach(() => vi.unstubAllGlobals());

describe("Dashboard route", () => {
  it("shows the signed-in user from the parent loader", async () => {
    renderDashboard(() => json(dashboard));
    expect(await screen.findByText("Signed in as Alice (ADMIN).")).toBeInTheDocument();
  });

  it("fails loudly when the authenticated parent route is missing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const router = createMemoryRouter([{ path: "/", Component: Dashboard }]);
    render(<RouterProvider router={router} />);
    expect(
      await screen.findByRole("heading", { name: "Dashboard must render inside the authenticated layout route" }),
    ).toBeInTheDocument();
    spy.mockRestore();
  });

  it("(a) shows the metric cards", async () => {
    renderDashboard(() => json(dashboard));
    for (const [label, value] of [
      ["Total employees", "8"],
      ["Active employees", "7"],
      ["Departments", "2"],
      ["Countries", "3"],
      ["Without salary", "2"],
    ]) {
      const card = (await screen.findByText(label)).parentElement as HTMLElement;
      expect(within(card).getByText(value)).toBeInTheDocument();
    }
  });

  it("(b) shows one salary block per currency and never a combined total", async () => {
    renderDashboard(() => json(dashboard));
    const overview = (await screen.findByRole("heading", { name: "Salary overview" })).closest("div") as HTMLElement;
    const card = overview.parentElement as HTMLElement;
    expect(within(card).getByText("USD")).toBeInTheDocument();
    expect(within(card).getByText("INR")).toBeInTheDocument();
    expect(within(card).getByText("Total $11,200.00")).toBeInTheDocument();
    expect(within(card).getByText("Average $2,800.00")).toBeInTheDocument();
    expect(within(card).getByText("Median $2,750.00")).toBeInTheDocument();
    expect(within(card).getByText("Total ₹120,000.00")).toBeInTheDocument();
    expect(within(card).getByText("Average ₹120,000.00")).toBeInTheDocument();
    expect(within(card).getByText("Median ₹120,000.00")).toBeInTheDocument();
    expect(screen.queryByText(/131200/)).not.toBeInTheDocument();
    expect(screen.queryByText(/131,200/)).not.toBeInTheDocument();
  });

  it("(c) lists departments with each currency line", async () => {
    renderDashboard(() => json(dashboard));
    const table = await screen.findByRole("table", { name: "Departments" });
    const eng = within(table).getByRole("row", { name: /Engineering/ });
    expect(within(eng).getByText(/\$4,400\.00/)).toBeInTheDocument();
    expect(within(eng).getByText(/₹120,000\.00/)).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /Design/ })).toBeInTheDocument();
  });

  it("(d) resolves country names and falls back to the code", async () => {
    renderDashboard(() => json(dashboard));
    const table = await screen.findByRole("table", { name: "Countries" });
    expect(within(table).getByText("United States")).toBeInTheDocument();
    expect(within(table).getByText("ZZ")).toBeInTheDocument();
  });

  it("(e) renders recent employees and revisions", async () => {
    renderDashboard(() => json(dashboard));
    expect(await screen.findByText(/EMP-0009/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Asha Rao" })[0]).toHaveAttribute("href", "/employees/e1");
    expect(screen.getByText("+30.00%")).toBeInTheDocument();
    expect(screen.getByText(/Annual review/)).toBeInTheDocument();
    expect(screen.getByText(/Hannah HR/)).toBeInTheDocument();
  });

  it("(f) handles empty data", async () => {
    renderDashboard(() => json(empty));
    expect(await screen.findByText("No salary data yet")).toBeInTheDocument();
    expect(screen.getAllByText("No recent activity")).toHaveLength(2);
  });

  it("(g) shows an error with retry when the API fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderDashboard(() => json({ error: { message: "boom" } }, 500));
    expect(await screen.findByText("Could not load the dashboard. Please try again.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/dashboard");
    spy.mockRestore();
  });

  it("(h) redirects to /login on 401", async () => {
    renderDashboard(() => json({ error: { message: "Unauthorized" } }, 401));
    expect(await screen.findByText("login page")).toBeInTheDocument();
  });

  it("(i) links to salary analytics", async () => {
    renderDashboard(() => json(dashboard));
    expect(await screen.findByRole("link", { name: "Open salary analytics" })).toHaveAttribute("href", "/analytics");
  });
});
