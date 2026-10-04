import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

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
        path: "dashboard",
        loader: ({ request }) => loader({ request, params: {}, context: {} } as Parameters<typeof loader>[0]),
        Component: Dashboard,
        ErrorBoundary,
      },
      { path: "/login", Component: () => <div>login page</div> },
    ],
    { initialEntries: ["/dashboard"] },
  );
  render(<RouterProvider router={router} />);
}

afterEach(() => vi.unstubAllGlobals());

describe("Dashboard route", () => {
  it("shows the as-of date and no signed-in paragraph", async () => {
    renderDashboard(() => json(dashboard));
    expect(await screen.findByText("As of Oct 3, 2026")).toBeInTheDocument();
    expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument();
  });

  it("shows four metric tiles and no total employees tile", async () => {
    renderDashboard(() => json(dashboard));
    for (const [label, value] of [
      ["Active employees", "7"],
      ["Departments", "2"],
      ["Countries", "3"],
      ["Without salary", "2"],
    ]) {
      const card = (await screen.findByText(label)).parentElement as HTMLElement;
      expect(within(card).getByText(value)).toBeInTheDocument();
    }
    expect(screen.queryByText("Total employees")).not.toBeInTheDocument();
  });

  it("links the attention item to employees without salary", async () => {
    renderDashboard(() => json(dashboard));
    expect(await screen.findByRole("heading", { name: "Attention" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2 employees have no salary" })).toHaveAttribute("href", "/employees?salary=without");
  });

  it("uses the singular when one employee has no salary", async () => {
    renderDashboard(() => json({ ...dashboard, metrics: { ...dashboard.metrics, withoutSalary: 1 } }));
    expect(await screen.findByRole("link", { name: "1 employee has no salary" })).toBeInTheDocument();
  });

  it("says nothing needs attention when everyone has a salary", async () => {
    renderDashboard(() => json(empty));
    expect(await screen.findByText("Nothing needs your attention.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /no salary/ })).not.toBeInTheDocument();
  });

  it("no longer shows salary or breakdown sections", async () => {
    renderDashboard(() => json(dashboard));
    await screen.findByRole("heading", { name: "Attention" });
    for (const name of ["Salary overview", "By department", "By country"]) {
      expect(screen.queryByRole("heading", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("link", { name: "Open salary analytics" })).not.toBeInTheDocument();
  });

  it("renders recent hires and salary changes with employee links", async () => {
    renderDashboard(() => json(dashboard));
    expect(await screen.findByRole("heading", { name: "Recent hires" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent salary changes" })).toBeInTheDocument();
    expect(screen.getByText(/EMP-0009/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Asha Rao" })[0]).toHaveAttribute("href", "/employees/e1");
    expect(screen.getByText("+30.00%")).toBeInTheDocument();
    expect(screen.getByText(/Annual review/)).toBeInTheDocument();
    expect(screen.getByText(/Hannah HR/)).toBeInTheDocument();
    expect(screen.getByText(/joined Sep 1, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/effective Oct 1, 2026/)).toBeInTheDocument();
  });

  it("handles empty recent activity", async () => {
    renderDashboard(() => json(empty));
    expect(await screen.findAllByText("No recent activity")).toHaveLength(2);
  });

  it("shows an error with retry when the API fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderDashboard(() => json({ error: { message: "boom" } }, 500));
    expect(await screen.findByText("Could not load the dashboard. Please try again.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/dashboard");
    spy.mockRestore();
  });

  it("redirects to /login on 401", async () => {
    renderDashboard(() => json({ error: { message: "Unauthorized" } }, 401));
    expect(await screen.findByText("login page")).toBeInTheDocument();
  });
});
