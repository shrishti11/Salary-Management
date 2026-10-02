import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../app";
import { createTestUser, forgedCookie, loginAs } from "../../test/helpers";
import { createAnalyticsFixture } from "./analytics.fixtures";

let fx: Awaited<ReturnType<typeof createAnalyticsFixture>>;
beforeAll(async () => {
  fx = await createAnalyticsFixture();
});
afterAll(async () => {
  await fx.cleanup();
});

const get = (qs: string) => fx.agent.get(`/api/analytics/summary?designation=${encodeURIComponent(fx.designation)}${qs}`);
const usd = (body: any) => body.currencies.find((c: any) => c.currency === "USD");

describe("GET /api/analytics/summary", () => {
  it("computes per-currency stats from current salaries (active, gross, today)", async () => {
    const res = await get("");
    expect(res.status).toBe(200);
    expect(res.body.basis).toBe("gross");
    expect(res.body.currencies.map((c: any) => c.currency)).toEqual(["USD", "INR"]);
    expect(usd(res.body)).toEqual({
      currency: "USD", count: 4, total: "11200.00", average: "2800.00", median: "2750.00",
      min: "1300.00", max: "4400.00", p25: "2200.00", p75: "3350.00",
    });
    expect(res.body.currencies[1]).toMatchObject({ currency: "INR", count: 1, total: "120000.00", median: "120000.00" });
  });

  it("headcount ignores the status filter; salary counts follow it; future-only and no-salary employees are withoutSalary", async () => {
    const res = await get("");
    expect(res.body.headcount).toEqual({ total: 8, active: 7, inactive: 1, withSalary: 5, withoutSalary: 2 });
  });

  it("net basis subtracts deductions", async () => {
    const res = await get("&basis=net");
    expect(usd(res.body)).toMatchObject({ count: 4, total: "11000.00", average: "2750.00", min: "1100.00" });
  });

  it("status=ALL includes inactive employees", async () => {
    const res = await get("&status=ALL");
    expect(usd(res.body)).toMatchObject({ count: 5, total: "20200.00" });
  });

  it("status=INACTIVE returns only inactive employees", async () => {
    const res = await get("&status=INACTIVE");
    expect(res.body.currencies).toHaveLength(1);
    expect(usd(res.body)).toMatchObject({ count: 1, total: "9000.00" });
  });

  it("asOf in the past uses the record that was current then; currencies are never combined", async () => {
    const res = await get("&asOf=2024-12-31");
    expect(res.body.currencies.map((c: any) => c.currency)).toEqual(["USD", "EUR", "INR"]);
    expect(usd(res.body)).toMatchObject({ count: 3, total: "6500.00" });
    expect(res.body.currencies[1]).toMatchObject({ currency: "EUR", count: 1, total: "4000.00" });
    expect(res.body.currencies[2]).toMatchObject({ currency: "INR", count: 1, total: "100000.00" });
  });

  it("asOf before any salary leaves everyone without salary", async () => {
    const res = await get("&asOf=2000-01-01");
    expect(res.body.currencies).toEqual([]);
    expect(res.body.headcount).toMatchObject({ withSalary: 0, withoutSalary: 7 });
  });

  it("country and department filters narrow the population", async () => {
    const us = await get("&country=US");
    expect(usd(us.body)).toMatchObject({ count: 3, total: "6800.00" });
    expect(us.body.headcount).toMatchObject({ total: 4, withoutSalary: 1 });
    const dept = await get(`&departmentId=${fx.deptA}`);
    expect(usd(dept.body)).toMatchObject({ count: 3 });
    expect(dept.body.headcount.total).toBe(3);
  });

  it("currency filter keeps only that currency", async () => {
    const res = await get("&currency=INR");
    expect(res.body.currencies.map((c: any) => c.currency)).toEqual(["INR"]);
  });

  it("returns empty results, not an error, when nothing matches", async () => {
    const res = await fx.agent.get("/api/analytics/summary?designation=does-not-exist-zzz");
    expect(res.status).toBe(200);
    expect(res.body.currencies).toEqual([]);
    expect(res.body.headcount).toEqual({ total: 0, active: 0, inactive: 0, withSalary: 0, withoutSalary: 0 });
  });

  it("treats quotes and percent signs in filters as plain values", async () => {
    const res = await fx.agent.get(`/api/analytics/summary?designation=${encodeURIComponent("O'Brien%; DROP TABLE x")}`);
    expect(res.status).toBe(200);
    expect(res.body.currencies).toEqual([]);
  });

  it("rejects bad params with 400", async () => {
    for (const qs of ["?basis=weird", "?country=XX", "?currency=ZZZ", "?departmentId=nope", "?asOf=2024-02-30", "?bogus=1", "?status=all"]) {
      const res = await fx.agent.get(`/api/analytics/summary${qs}`);
      expect(res.status, qs).toBe(400);
    }
  });

  it("requires authentication and an allowed role", async () => {
    expect((await request(app).get("/api/analytics/summary")).status).toBe(401);
    expect((await request(app).get("/api/analytics/summary").set("Cookie", forgedCookie("EMPLOYEE"))).status).toBe(403);
    const adminEmail = `ana-admin-${randomUUID().slice(0, 8)}@example.com`;
    const admin = await createTestUser(adminEmail, "ADMIN");
    try {
      const adminAgent = await loginAs(adminEmail);
      expect((await adminAgent.get("/api/analytics/summary")).status).toBe(200);
    } finally {
      const { prisma } = await import("../../lib/prisma");
      await prisma.user.delete({ where: { id: admin.id } });
    }
  });
});
