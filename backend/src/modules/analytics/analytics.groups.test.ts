import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../app";
import { forgedCookie } from "../../test/helpers";
import { createAnalyticsFixture } from "./analytics.fixtures";
import { getGroups } from "./analytics.service";

let fx: Awaited<ReturnType<typeof createAnalyticsFixture>>;
beforeAll(async () => {
  fx = await createAnalyticsFixture();
});
afterAll(async () => {
  await fx.cleanup();
});
const q = (path: string, qs = "") => fx.agent.get(`/api/analytics/${path}?designation=${encodeURIComponent(fx.designation)}${qs}`);

describe("GET /api/analytics/distribution", () => {
  it("buckets each currency between its min and max (10 equal-width buckets, integer cents)", async () => {
    const res = await q("distribution", "&currency=USD");
    expect(res.status).toBe(200);
    const usd = res.body.currencies[0];
    expect(usd.currency).toBe("USD");
    expect(usd.count).toBe(4);
    expect(usd.buckets).toHaveLength(10);
    expect(usd.buckets.map((b: any) => b.count)).toEqual([1, 0, 0, 1, 0, 1, 0, 0, 0, 1]);
    expect(usd.buckets[0]).toMatchObject({ from: "1300.00", to: "1609.99" });
    expect(usd.buckets[9]).toMatchObject({ from: "4090.00", to: "4400.00" });
  });

  it("uses one bucket when every value is equal", async () => {
    const res = await q("distribution", "&currency=INR");
    expect(res.body.currencies[0].buckets).toEqual([{ from: "120000.00", to: "120000.00", count: 1 }]);
  });

  it("returns one entry per currency without a currency filter, never merged", async () => {
    const res = await q("distribution");
    expect(res.body.currencies.map((c: any) => c.currency)).toEqual(["USD", "INR"]);
  });

  it("returns empty currencies when nothing matches", async () => {
    const res = await q("distribution", "&asOf=2000-01-01");
    expect(res.body.currencies).toEqual([]);
  });
});

describe("GET /api/analytics/groups", () => {
  it("groups by department with headcount, withoutSalary and per-currency stats", async () => {
    const res = await q("groups", "&groupBy=department");
    expect(res.status).toBe(200);
    const a = res.body.groups.find((g: any) => g.key === fx.deptA);
    const b = res.body.groups.find((g: any) => g.key === fx.deptB);
    expect(a).toMatchObject({ headcount: 3, withoutSalary: 0 });
    expect(a.label).toMatch(/^Ana A /);
    expect(a.currencies).toEqual([
      { currency: "USD", count: 3, total: "6800.00", average: "2266.67", median: "2500.00", min: "1300.00", max: "3000.00", p25: "1900.00", p75: "2750.00" },
    ]);
    expect(b).toMatchObject({ headcount: 4, withoutSalary: 2 });
  });

  it("suppresses currency entries with fewer than 3 salaried employees", async () => {
    const res = await q("groups", "&groupBy=department");
    const b = res.body.groups.find((g: any) => g.key === fx.deptB);
    expect(b.currencies).toEqual([
      { currency: "INR", count: 1, suppressed: true },
      { currency: "USD", count: 1, suppressed: true },
    ]);
  });

  it("returns full stats for small groups when suppress is false", async () => {
    const res = await getGroups({
      asOf: new Date().toISOString().slice(0, 10),
      basis: "gross",
      status: "ACTIVE",
      designation: fx.designation,
      groupBy: "department",
      suppress: false,
    });
    const b = res.groups.find((g) => g.key === fx.deptB)!;
    expect(b.currencies.map((c) => c.currency)).toEqual(["INR", "USD"]);
    for (const c of b.currencies) {
      expect(c).not.toHaveProperty("suppressed");
      expect(c).toMatchObject({ count: 1 });
      expect(c).toHaveProperty("median");
    }
  });

  it("groups by country and designation", async () => {
    const byCountry = await q("groups", "&groupBy=country");
    const us = byCountry.body.groups.find((g: any) => g.key === "US");
    expect(us).toMatchObject({ label: "US", headcount: 4, withoutSalary: 1 });
    expect(us.currencies[0]).toMatchObject({ currency: "USD", count: 3 });
    const byRole = await q("groups", "&groupBy=designation");
    expect(byRole.body.groups).toHaveLength(1);
    expect(byRole.body.groups[0]).toMatchObject({ key: fx.designation, headcount: 7 });
  });

  it("orders groups by headcount descending", async () => {
    const res = await q("groups", "&groupBy=department");
    expect(res.body.groups.map((g: any) => g.key)).toEqual([fx.deptB, fx.deptA]);
  });

  it("currency filter drops other currencies but keeps headcount", async () => {
    const res = await q("groups", "&groupBy=department&currency=USD");
    const b = res.body.groups.find((g: any) => g.key === fx.deptB);
    expect(b.currencies.map((c: any) => c.currency)).toEqual(["USD"]);
    expect(b.withoutSalary).toBe(2);
  });

  it("rejects an unknown groupBy", async () => {
    expect((await q("groups", "&groupBy=level")).status).toBe(400);
  });
});

describe("GET /api/analytics/filters", () => {
  it("lists departments, countries, designations and currencies in use", async () => {
    const res = await fx.agent.get("/api/analytics/filters");
    expect(res.status).toBe(200);
    expect(res.body.departments.map((d: any) => d.id)).toEqual(expect.arrayContaining([fx.deptA, fx.deptB]));
    expect(res.body.countries).toEqual(expect.arrayContaining(["US", "IN", "DE"]));
    expect(res.body.designations).toContain(fx.designation);
    expect(res.body.currencies).toEqual(expect.arrayContaining(["USD", "EUR", "INR"]));
  });
});

describe("auth", () => {
  it.each(["distribution", "groups", "filters"])("%s requires auth and role", async (path) => {
    expect((await request(app).get(`/api/analytics/${path}`)).status).toBe(401);
    expect((await request(app).get(`/api/analytics/${path}`).set("Cookie", forgedCookie("EMPLOYEE"))).status).toBe(403);
  });
});
