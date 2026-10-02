import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../app";
import { forgedCookie } from "../../test/helpers";
import { createAnalyticsFixture } from "./analytics.fixtures";
import { getRecentRevisions } from "./dashboard.service";

let fx: Awaited<ReturnType<typeof createAnalyticsFixture>>;
beforeAll(async () => {
  fx = await createAnalyticsFixture();
});
afterAll(async () => {
  await fx.cleanup();
});

describe("GET /api/dashboard", () => {
  it("returns the overview shape", async () => {
    const res = await fx.agent.get("/api/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.metrics.totalEmployees).toBeGreaterThanOrEqual(8);
    expect(res.body.metrics.activeEmployees).toBeGreaterThanOrEqual(7);
    expect(res.body.metrics.activeEmployees).toBeLessThanOrEqual(res.body.metrics.totalEmployees);
    expect(res.body.metrics.departmentCount).toBeGreaterThanOrEqual(2);
    expect(res.body.metrics.countryCount).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(res.body.metrics.currencies)).toBe(true);
    expect(res.body.asOf).toBe(new Date().toISOString().slice(0, 10));
  });

  it("summarises our departments by active headcount and per-currency money (gross)", async () => {
    const res = await fx.agent.get("/api/dashboard");
    const a = res.body.departments.find((d: any) => d.id === fx.deptA);
    const b = res.body.departments.find((d: any) => d.id === fx.deptB);
    expect(a).toMatchObject({ headcount: 3, currencies: [{ currency: "USD", count: 3, total: "6800.00", average: "2266.67" }] });
    expect(b.headcount).toBe(4);
    expect(b.currencies).toEqual([
      { currency: "INR", count: 1, total: "120000.00", average: "120000.00" },
      { currency: "USD", count: 1, total: "4400.00", average: "4400.00" },
    ]);
    const sorted = res.body.departments.map((d: any) => d.headcount);
    expect(sorted).toEqual([...sorted].sort((x: number, y: number) => y - x));
  });

  it("lists countries with headcount and per-currency money", async () => {
    const res = await fx.agent.get("/api/dashboard");
    const us = res.body.countries.find((c: any) => c.country === "US");
    expect(us.headcount).toBeGreaterThanOrEqual(4);
    expect(us.currencies.find((c: any) => c.currency === "USD").count).toBeGreaterThanOrEqual(3);
  });

  it("returns at most 5 recent employees and revisions, newest first", async () => {
    const res = await fx.agent.get("/api/dashboard");
    expect(res.body.recentEmployees.length).toBeLessThanOrEqual(5);
    expect(res.body.recentRevisions.length).toBeLessThanOrEqual(5);
    const created = res.body.recentEmployees.map((e: any) => e.createdAt);
    expect(created).toEqual([...created].sort().reverse());
    const rev = res.body.recentRevisions.map((r: any) => r.createdAt);
    expect(rev).toEqual([...rev].sort().reverse());
  });

  it("revisions are records with an earlier record and carry the change percent", async () => {
    const all = await getRecentRevisions(1000);
    const mine = all.filter((r) => Object.values(fx.ids).includes(r.employee.id));
    // e1 (2025-01, +30%), e4 (2025-03, +20%), e5 (2025-02, currency change), e1 future-dated revision
    const e1 = mine.find((r) => r.employee.id === fx.ids["1"] && r.effectiveDate === "2025-01-01");
    expect(e1).toMatchObject({ currency: "USD", gross: "1300.00", changePercent: "30.00", reason: "r-2025-01-01", createdBy: { id: fx.userId } });
    const e5 = mine.find((r) => r.employee.id === fx.ids["5"]);
    expect(e5).toMatchObject({ currency: "USD", gross: "4400.00", changePercent: null });
    expect(mine.find((r) => r.employee.id === fx.ids["2"])).toBeUndefined(); // initial record, not a revision
  });

  it("requires auth and role; rejects query params", async () => {
    expect((await request(app).get("/api/dashboard")).status).toBe(401);
    expect((await request(app).get("/api/dashboard").set("Cookie", forgedCookie("EMPLOYEE"))).status).toBe(403);
    expect((await fx.agent.get("/api/dashboard?x=1")).status).toBe(400);
  });
});
