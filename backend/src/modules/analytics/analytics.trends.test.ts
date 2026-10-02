import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../app";
import { forgedCookie } from "../../test/helpers";
import { createAnalyticsFixture } from "./analytics.fixtures";

let fx: Awaited<ReturnType<typeof createAnalyticsFixture>>;
beforeAll(async () => {
  fx = await createAnalyticsFixture();
});
afterAll(async () => {
  await fx.cleanup();
});

const t = (qs = "") => fx.agent.get(`/api/analytics/trends?designation=${encodeURIComponent(fx.designation)}&from=2024-01-01&to=2025-12-31${qs}`);
const month = (body: any, currency: string, m: string) =>
  body.currencies.find((c: any) => c.currency === currency).months.find((x: any) => x.month === m);

describe("GET /api/analytics/trends", () => {
  it("groups records by month of effectiveDate per currency, zero-filling the range", async () => {
    const res = await t();
    expect(res.status).toBe(200);
    for (const c of res.body.currencies) expect(c.months).toHaveLength(24);
    expect(month(res.body, "USD", "2024-01")).toMatchObject({ revisionCount: 0, newSalaryCount: 1, avgChangePercent: null, avgGross: "1000.00" });
    expect(month(res.body, "USD", "2024-06")).toMatchObject({ newSalaryCount: 2, avgGross: "2750.00" });
    expect(month(res.body, "USD", "2024-03")).toMatchObject({ revisionCount: 0, newSalaryCount: 0, avgGross: null });
  });

  it("computes revision count and average change percent on the same currency", async () => {
    const res = await t();
    expect(month(res.body, "USD", "2025-01")).toMatchObject({ revisionCount: 1, avgChangePercent: "30.00", avgGross: "1300.00" });
    expect(month(res.body, "INR", "2025-03")).toMatchObject({ revisionCount: 1, avgChangePercent: "20.00" });
  });

  it("counts a currency-changing revision but excludes it from the change percent", async () => {
    const res = await t();
    expect(month(res.body, "USD", "2025-02")).toMatchObject({ revisionCount: 1, avgChangePercent: null, avgGross: "4400.00" });
  });

  it("net basis changes the percent", async () => {
    const res = await t("&basis=net");
    expect(month(res.body, "USD", "2025-01")).toMatchObject({ avgChangePercent: "10.00", avgNet: "1100.00" });
  });

  it("ignores future-dated records and respects status", async () => {
    const all = await t("&status=ALL");
    expect(month(all.body, "USD", "2024-01").newSalaryCount).toBe(2); // e1 + inactive e6
  });

  it("currency filter keeps one currency", async () => {
    const res = await t("&currency=EUR");
    expect(res.body.currencies.map((c: any) => c.currency)).toEqual(["EUR"]);
  });

  it("defaults to the last 12 months ending today", async () => {
    const res = await fx.agent.get(`/api/analytics/trends?designation=${encodeURIComponent(fx.designation)}`);
    expect(res.status).toBe(200);
    expect(res.body.to).toBe(new Date().toISOString().slice(0, 10));
    expect(res.body.currencies).toEqual([]); // fixture records are older than 12 months or in the future
  });

  it("returns empty currencies for a range without records", async () => {
    const res = await fx.agent.get(`/api/analytics/trends?designation=${encodeURIComponent(fx.designation)}&from=2010-01-01&to=2010-06-30`);
    expect(res.status).toBe(200);
    expect(res.body.currencies).toEqual([]);
  });

  it("rejects invalid ranges", async () => {
    const d = encodeURIComponent(fx.designation);
    const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    for (const qs of [`&from=2025-02-01&to=2025-01-01`, `&to=${future}`, `&from=2015-01-01&to=2025-12-31`, `&from=2024-02-30`, `&from=0001-01-01`]) {
      const res = await fx.agent.get(`/api/analytics/trends?designation=${d}${qs}`);
      expect(res.status, qs).toBe(400);
    }
  });

  it("requires auth and role", async () => {
    expect((await request(app).get("/api/analytics/trends")).status).toBe(401);
    expect((await request(app).get("/api/analytics/trends").set("Cookie", forgedCookie("EMPLOYEE"))).status).toBe(403);
  });
});
