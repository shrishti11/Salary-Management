import { describe, expect, it, vi, afterEach } from "vitest";

import {
  DEFAULT_ANALYTICS_PARAMS,
  getAnalyticsGroups,
  getAnalyticsTrends,
  hasActiveAnalyticsFilters,
  parseAnalyticsParams,
  toAnalyticsSearchParams,
} from "./analytics-api";

afterEach(() => vi.unstubAllGlobals());

describe("parseAnalyticsParams", () => {
  it("falls back to defaults for missing or invalid values", () => {
    expect(parseAnalyticsParams(new URLSearchParams("status=bogus&basis=x&groupBy=level&country=ZZ&asOf=2024-02-30&departmentId=nope"))).toEqual(DEFAULT_ANALYTICS_PARAMS);
  });
  it("reads valid values", () => {
    const p = parseAnalyticsParams(new URLSearchParams("status=ALL&basis=net&groupBy=country&country=US&currency=USD&designation=Engineer&asOf=2025-01-31&from=2024-01-01&to=2024-12-31"));
    expect(p).toMatchObject({ status: "ALL", basis: "net", groupBy: "country", country: "US", currency: "USD", designation: "Engineer", asOf: "2025-01-31", from: "2024-01-01", to: "2024-12-31" });
  });
});

describe("toAnalyticsSearchParams", () => {
  it("omits defaults and empty values", () => {
    expect(toAnalyticsSearchParams(DEFAULT_ANALYTICS_PARAMS).toString()).toBe("");
    expect(toAnalyticsSearchParams({ ...DEFAULT_ANALYTICS_PARAMS, basis: "net", country: "US" }).toString()).toBe("country=US&basis=net");
  });
});

describe("hasActiveAnalyticsFilters", () => {
  it("is false for defaults (basis and groupBy are views, not filters)", () => {
    expect(hasActiveAnalyticsFilters(DEFAULT_ANALYTICS_PARAMS)).toBe(false);
    expect(hasActiveAnalyticsFilters({ ...DEFAULT_ANALYTICS_PARAMS, basis: "net", groupBy: "country" })).toBe(false);
    expect(hasActiveAnalyticsFilters({ ...DEFAULT_ANALYTICS_PARAMS, country: "US" })).toBe(true);
    expect(hasActiveAnalyticsFilters({ ...DEFAULT_ANALYTICS_PARAMS, status: "ALL" })).toBe(true);
  });
});

describe("fetchers", () => {
  const spy = () => {
    const seen: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      seen.push(new URL(String(input)));
      return new Response(JSON.stringify({ ok: 1 }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    return seen;
  };
  it("sends only the params each endpoint accepts", async () => {
    const seen = spy();
    const params = { ...DEFAULT_ANALYTICS_PARAMS, country: "US", asOf: "2025-01-31", from: "2024-01-01", to: "2024-12-31", groupBy: "country" as const };
    await getAnalyticsGroups(new Request("http://x/analytics"), params);
    await getAnalyticsTrends(new Request("http://x/analytics"), params);
    expect(seen[0]!.pathname).toBe("/api/analytics/groups");
    expect(Object.fromEntries(seen[0]!.searchParams)).toEqual({ country: "US", asOf: "2025-01-31", groupBy: "country" });
    expect(seen[1]!.pathname).toBe("/api/analytics/trends");
    expect(Object.fromEntries(seen[1]!.searchParams)).toEqual({ country: "US", from: "2024-01-01", to: "2024-12-31" });
  });
});
