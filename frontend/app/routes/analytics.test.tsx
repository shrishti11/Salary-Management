import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import Analytics, { ErrorBoundary, loader } from "./analytics";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const stats = (currency: string, count: number, avg: string) => ({
  currency, count, total: "11200.00", average: avg, median: "2750.00", min: "1300.00", max: "4400.00", p25: "2200.00", p75: "3350.00",
});

const summary = {
  asOf: "2026-10-03",
  basis: "gross",
  headcount: { total: 8, active: 7, inactive: 1, withSalary: 5, withoutSalary: 2 },
  currencies: [stats("USD", 4, "2800.00"), stats("INR", 1, "120000.00")],
};
const distribution = {
  asOf: "2026-10-03",
  basis: "gross",
  currencies: [{ currency: "USD", count: 4, buckets: [{ from: "1300.00", to: "2199.99", count: 2 }, { from: "2200.00", to: "4400.00", count: 2 }] }],
};
const groups = {
  asOf: "2026-10-03",
  basis: "gross",
  groupBy: "department",
  groups: [
    { key: "d1", label: "Design", headcount: 4, withoutSalary: 0, currencies: [stats("USD", 4, "2800.00")] },
    { key: "d2", label: "Legal", headcount: 2, withoutSalary: 0, currencies: [{ currency: "USD", count: 2, suppressed: true }] },
  ],
};
const trends = {
  from: "2025-11-01",
  to: "2026-10-31",
  basis: "gross",
  currencies: [
    {
      currency: "USD",
      months: [
        { month: "2026-08", revisionCount: 0, newSalaryCount: 0, avgChangePercent: null, avgGross: null, avgNet: null },
        { month: "2026-09", revisionCount: 3, newSalaryCount: 1, avgChangePercent: "7.50", avgGross: "3100.00", avgNet: "2700.00" },
      ],
    },
  ],
};
const DEPT = "11111111-1111-4111-8111-111111111111";
const filters = { departments: [{ id: DEPT, name: "Engineering" }], countries: ["US", "IN"], designations: ["Engineer"], currencies: ["USD", "INR"] };

const emptySummary = { ...summary, headcount: { total: 0, active: 0, inactive: 0, withSalary: 0, withoutSalary: 0 }, currencies: [] };

type Overrides = Partial<Record<"summary" | "distribution" | "groups" | "trends" | "filters", () => Response>>;

function backend(overrides: Overrides = {}, seen: URL[] = []) {
  const base = {
    summary: () => json(summary),
    distribution: () => json(distribution),
    groups: () => json(groups),
    trends: () => json(trends),
    filters: () => json(filters),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      seen.push(url);
      const name = url.pathname.split("/").pop() as keyof typeof base;
      return { ...base, ...overrides }[name]();
    }),
  );
  return seen;
}

function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/analytics",
        loader: ({ request }) => loader({ request, params: {}, context: {} } as Parameters<typeof loader>[0]),
        Component: Analytics,
        ErrorBoundary,
      },
      { path: "/login", Component: () => <div>login page</div> },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const find = (seen: URL[], name: string) => seen.find((u) => u.pathname === `/api/analytics/${name}`)!;

afterEach(() => vi.unstubAllGlobals());

describe("analytics route loader", () => {
  it("fetches summary and filters first, then the rest with the most populous currency", async () => {
    const seen = backend();
    renderAt("/analytics");
    await screen.findByRole("heading", { name: "Analytics" });

    const order = seen.map((u) => u.pathname.split("/").pop());
    expect(new Set(order.slice(0, 2))).toEqual(new Set(["summary", "filters"]));
    expect(new Set(order.slice(2))).toEqual(new Set(["distribution", "groups", "trends"]));
    expect(seen).toHaveLength(5);
    expect(find(seen, "summary").searchParams.get("currency")).toBeNull();
    for (const name of ["distribution", "groups", "trends"]) {
      const p = find(seen, name).searchParams;
      expect(p.get("currency")).toBe("USD");
      expect(p.has("status")).toBe(false);
      expect(p.has("basis")).toBe(false);
    }
  });

  it("sends non-default status and basis", async () => {
    const seen = backend();
    renderAt("/analytics?status=ALL&basis=net");
    await screen.findByRole("heading", { name: "Analytics" });
    for (const name of ["summary", "distribution", "groups", "trends"]) {
      const p = find(seen, name).searchParams;
      expect(p.get("status")).toBe("ALL");
      expect(p.get("basis")).toBe("net");
    }
  });

  it("passes each endpoint only the params it accepts", async () => {
    const seen = backend();
    renderAt("/analytics?currency=INR&country=US&basis=net&groupBy=country&asOf=2025-01-31&from=2024-01-01&to=2024-12-31");
    await screen.findByRole("heading", { name: "Analytics" });

    const keys = (name: string) => [...find(seen, name).searchParams.keys()].sort();
    expect(keys("summary")).toEqual(["asOf", "basis", "country", "currency"]);
    expect(keys("distribution")).toEqual(["asOf", "basis", "country", "currency"]);
    expect(keys("groups")).toEqual(["asOf", "basis", "country", "currency", "groupBy"]);
    expect(keys("trends")).toEqual(["basis", "country", "currency", "from", "to"]);
    expect(keys("filters")).toEqual([]);
    expect(find(seen, "groups").searchParams.get("currency")).toBe("INR");
  });

  it("redirects to /login on 401 from any call", async () => {
    backend({ trends: () => json({ error: { message: "Unauthorized" } }, 401) });
    renderAt("/analytics");
    expect(await screen.findByText("login page")).toBeInTheDocument();
  });
});

describe("analytics route page", () => {
  it("renders summary, distribution, groups and trends for the selected currency", async () => {
    backend();
    renderAt("/analytics");

    expect(await screen.findByRole("heading", { name: "Analytics" })).toBeInTheDocument();
    expect(screen.getByText(/Currencies are never combined; showing USD/)).toBeInTheDocument();
    expect(screen.getByText("Compensation summary")).toBeInTheDocument();
    for (const label of ["Employees", "Total", "Average", "Median", "Min", "Max", "P25", "P75"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("Across all currencies: 5 with salary · 2 without")).toBeInTheDocument();
    expect(screen.getAllByText(/gross · USD · as of 2026-10-03/).length).toBeGreaterThanOrEqual(3);

    expect(screen.getByRole("table", { name: "Distribution buckets in USD" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /Groups by department.*USD.*gross/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /over time in USD/ })).toBeInTheDocument();
    expect(screen.getByText(/2025-11-01 – 2026-10-31/)).toBeInTheDocument();

    const trendTable = screen.getByRole("table", { name: /Monthly activity in USD/i });
    expect(within(trendTable).getByRole("columnheader", { name: "Avg gross (USD)" })).toBeInTheDocument();
    expect(within(trendTable).getByText("2026-09")).toBeInTheDocument();
    expect(within(trendTable).queryByText("2026-08")).not.toBeInTheDocument();
    expect(within(trendTable).getByText("7.50%")).toBeInTheDocument();
    expect(within(trendTable).getByText("$3,100.00")).toBeInTheDocument();
  });

  it("writes filter changes to the URL without resetting others; Reset keeps basis and groupBy", async () => {
    backend();
    const router = renderAt("/analytics?basis=net&country=US");
    await screen.findByRole("heading", { name: "Analytics" });

    await userEvent.selectOptions(screen.getByLabelText("Status"), "ALL");
    await waitFor(() => expect(router.state.location.search).toContain("status=ALL"));
    expect(router.state.location.search).toContain("country=US");
    expect(router.state.location.search).toContain("basis=net");

    await userEvent.click(screen.getByRole("button", { name: "Compare by Role" }));
    await waitFor(() => expect(router.state.location.search).toContain("groupBy=designation"));

    await userEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    await waitFor(() => expect(router.state.location.search).not.toContain("country"));
    expect(router.state.location.search).not.toContain("status");
    expect(router.state.location.search).toContain("basis=net");
    expect(router.state.location.search).toContain("groupBy=designation");
  });

  it("shows empty states in every panel and Reset filters when filtered", async () => {
    backend({ summary: () => json(emptySummary), distribution: () => json({ ...distribution, currencies: [] }), groups: () => json({ ...groups, groups: [] }), trends: () => json({ ...trends, currencies: [] }) });
    renderAt("/analytics?country=US");

    await screen.findByRole("heading", { name: "Analytics" });
    expect(screen.getAllByText("No salary data for these filters")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Reset filters" })).toBeEnabled();
  });

  it("shows trends data even when the as-of summary has no salaries", async () => {
    backend({ summary: () => json(emptySummary) });
    renderAt("/analytics?asOf=2000-01-01");

    await screen.findByRole("heading", { name: "Analytics" });
    expect(screen.getByRole("table", { name: /Monthly activity in USD/i })).toBeInTheDocument();
    expect(screen.getAllByText("No salary data for these filters")).toHaveLength(3);
  });

  it("shows an inline error only in the panel whose call failed (distribution)", async () => {
    backend({ distribution: () => json({ error: { message: "boom" } }, 500) });
    renderAt("/analytics");

    await screen.findByRole("heading", { name: "Analytics" });
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(/could not load salary distribution/i);
    expect(screen.getByText("Compensation summary")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /Groups by department/i })).toBeInTheDocument();
  });

  it("keeps rendering other panels when the summary fails, passing the requested currency through", async () => {
    const seen = backend({ summary: () => json({ error: { message: "boom" } }, 500) });
    renderAt("/analytics");

    await screen.findByRole("heading", { name: "Analytics" });
    expect(screen.getByRole("alert")).toHaveTextContent(/could not load compensation summary/i);
    expect(find(seen, "groups").searchParams.has("currency")).toBe(false);
    expect(screen.getByRole("table", { name: /Groups by department/i })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Distribution buckets in USD" })).toBeInTheDocument();
  });

  it("alerts above the filters when filter options fail to load", async () => {
    backend({ filters: () => json({ error: { message: "boom" } }, 500) });
    renderAt("/analytics");
    await screen.findByRole("heading", { name: "Analytics" });
    expect(screen.getByRole("alert")).toHaveTextContent(/filter options/i);
    expect(screen.getByLabelText("Department")).toBeInTheDocument();
  });
});
