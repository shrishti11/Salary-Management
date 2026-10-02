# Dashboard and Salary Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only Dashboard and a filterable Salary Analytics page backed by Postgres aggregations, with per-currency money metrics.

**Architecture:** New backend module `modules/analytics` builds parameterised raw SQL (`prisma.$queryRaw`) from one shared "population" CTE (filtered employees, their current salary as of a date, a basis value). Five analytics endpoints and one dashboard endpoint reuse it. Frontend: loaders fetch with `apiFetchAs`/`apiCall`; Recharts charts render client-side only; tables always carry the same data.

**Tech Stack:** Express 5, Prisma 7 (`$queryRaw`), zod 4, Postgres, Vitest + Supertest; React Router 8 SSR, MUI 9, Recharts (new dependency), Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-10-03-dashboard-analytics-design.md`

## Global Constraints

- Branch `feature/dashboard-analytics` (already created). Never commit to `main`; never merge.
- Only new dependency: `recharts` (frontend). No other additions.
- Money never crosses currencies: every monetary aggregate is per currency. No float arithmetic on money in the app: SQL `numeric`, rounded to 2 dp, returned as decimal strings via `::text`. Distribution bucket edges use integer cents.
- "Current salary" = latest `SalaryRecord` with `effectiveDate <= asOf` (UTC). Future-dated records are ignored. Employees without one are counted in `withoutSalary` only.
- Basis `gross` = BASE+ALLOWANCE+BONUS; `net` = gross - DEDUCTION (`type = 'DEDUCTION'` subtracts).
- All new endpoints: `requireAuth` + `requireRole("ADMIN","HR_MANAGER")`, strict zod query schemas (unknown params -> 400), errors `{ error: { message, code? } }`.
- Group suppression: a currency entry with fewer than 3 salaried employees in `/groups` returns `{ currency, count, suppressed: true }` only.
- Code style: match `modules/salaries` (ESM `.ts` import suffixes in backend, `~/` alias in frontend, no comments beyond non-obvious "why").
- Prisma table/column names are the model names, camelCase, quoted: `"Employee"`, `"SalaryRecord"`, `"SalaryComponent"`, `"Department"`, `"employeeId"`, `"effectiveDate"`, `"salaryRecordId"`, `"departmentId"`; enums `"EmployeeStatus"`, `"SalaryComponentType"`. Verify against `backend/prisma/schema.prisma` and the migrations before relying on this.
- Backend tests share a dev Postgres with seed data. Isolate every test dataset with unique per-run names (department names, designation `QA-<suffix>`) and filter by them. Clean up in `afterAll`.

## Review Focus

- Employee whose only salary record is future-dated: counted in headcount/`withoutSalary`, absent from money stats (Task 1 test).
- Employee who changed currency between revisions: counted once, in the current currency; cross-currency change excluded from `avgChangePercent` (Tasks 1 and 3 tests).
- Single-value or all-equal population for the distribution: one bucket, no divide-by-zero (Task 2 test).
- Filters that match nothing (and an empty trend range): empty arrays and zero counts, not errors (Tasks 1, 2, 3 tests).
- Filter values containing quotes/percent signs (`designation=O'Brien%`): parameterised, no SQL error (Task 1 test).

---

### Task 1: Backend foundation and summary endpoint

**Files:**
- Create: `backend/src/modules/analytics/analytics.dates.ts`
- Create: `backend/src/modules/analytics/analytics.schema.ts`
- Create: `backend/src/modules/analytics/analytics.sql.ts`
- Create: `backend/src/modules/analytics/analytics.service.ts`
- Create: `backend/src/modules/analytics/analytics.controller.ts`
- Create: `backend/src/modules/analytics/analytics.routes.ts`
- Create: `backend/src/modules/analytics/analytics.fixtures.ts` (test-only data builder, reused by Tasks 2-3 tests)
- Create: `backend/src/modules/analytics/analytics.summary.test.ts`
- Modify: `backend/src/app.ts` (mount `/api/analytics`)

**Interfaces:**
- Produces (used by Tasks 2-3):
  - `todayUtc(): string`, `toDate(s: string): Date`, `monthsBetween(from: string, to: string): string[]` (inclusive `YYYY-MM` list) in `analytics.dates.ts`.
  - `PopulationFilters = { departmentId?: string; country?: string; designation?: string; status: "ACTIVE"|"INACTIVE"|"ALL"; basis: "gross"|"net"; asOf: string }`, `populationCtes(f, ignoreStatus?): Prisma.Sql` (a CTE list WITHOUT the leading `WITH`, defining `emp`, `rec`, `cur`, `pop`), `employeeConditions(f, ignoreStatus): Prisma.Sql`, `STATS_COLUMNS: Prisma.Sql` (columns in order `count,total,average,median,min,max,p25,p75`) in `analytics.sql.ts`.
  - `CurrencyStats`, `getSummary(f)` in `analytics.service.ts`.
  - `analyticsRouter` exported from `analytics.routes.ts`.
  - Fixture helper `createAnalyticsFixture()` returning `{ suffix, designation, deptA, deptB, userId, agent, ids, cleanup }` (see Step 1).

- [ ] **Step 1: Write the test fixture and the failing summary tests**

`analytics.fixtures.ts` (all tests in Tasks 1-3 use it; one dataset per test file, unique per run):

```ts
import { randomUUID } from "node:crypto";

import { prisma } from "../../lib/prisma.ts";
import { createTestUser, loginAs } from "../../test/helpers.ts";

type Component = { type: "BASE" | "ALLOWANCE" | "BONUS" | "DEDUCTION"; name: string; amount: string };
const base = (amount: string): Component[] => [{ type: "BASE", name: "Base salary", amount }];
const date = (s: string) => new Date(`${s}T00:00:00.000Z`);
export const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

/**
 * Employees (all share `designation`):
 *  e1 deptA US ACTIVE   USD 2024-01-01 base 1000 | 2025-01-01 base 1200 + allowance 100 - deduction 200 (gross 1300, net 1100) | future base 5000 (ignored)
 *  e2 deptA US ACTIVE   USD 2024-06-01 base 2000 + bonus 500 (gross 2500)
 *  e3 deptA US ACTIVE   USD 2024-06-01 base 3000
 *  e4 deptB IN ACTIVE   INR 2023-01-01 base 100000 | 2025-03-01 base 120000
 *  e5 deptB DE ACTIVE   EUR 2024-01-01 base 4000 | 2025-02-01 USD base 4400 (currency change)
 *  e6 deptB DE INACTIVE USD 2024-01-01 base 9000
 *  e7 deptB IN ACTIVE   no salary
 *  e8 deptB US ACTIVE   only a future-dated salary (day +10, USD 3000)
 */
export async function createAnalyticsFixture() {
  const suffix = randomUUID().slice(0, 8);
  const designation = `QA-${suffix}`;
  const user = await createTestUser(`ana-${suffix}@example.com`);
  const deptA = await prisma.department.create({ data: { name: `Ana A ${suffix}` } });
  const deptB = await prisma.department.create({ data: { name: `Ana B ${suffix}` } });
  const ids: Record<string, string> = {};

  const specs = [
    { n: "1", dept: deptA.id, country: "US", status: "ACTIVE" as const },
    { n: "2", dept: deptA.id, country: "US", status: "ACTIVE" as const },
    { n: "3", dept: deptA.id, country: "US", status: "ACTIVE" as const },
    { n: "4", dept: deptB.id, country: "IN", status: "ACTIVE" as const },
    { n: "5", dept: deptB.id, country: "DE", status: "ACTIVE" as const },
    { n: "6", dept: deptB.id, country: "DE", status: "INACTIVE" as const },
    { n: "7", dept: deptB.id, country: "IN", status: "ACTIVE" as const },
    { n: "8", dept: deptB.id, country: "US", status: "ACTIVE" as const },
  ];
  for (const s of specs) {
    const e = await prisma.employee.create({
      data: {
        employeeCode: `AN${suffix.toUpperCase()}-${s.n}`,
        firstName: `First${s.n}`,
        lastName: `Last${s.n}`,
        email: `an${s.n}.${suffix}@example.com`,
        departmentId: s.dept,
        designation,
        country: s.country,
        joiningDate: date("2015-01-01"),
        status: s.status,
      },
    });
    ids[s.n] = e.id;
  }

  async function add(n: string, effectiveDate: string, components: Component[], currency = "USD") {
    await prisma.salaryRecord.create({
      data: { employeeId: ids[n]!, currency, effectiveDate: date(effectiveDate), reason: `r-${effectiveDate}`, createdById: user.id, components: { create: components } },
    });
  }
  await add("1", "2024-01-01", base("1000.00"));
  await add("1", "2025-01-01", [
    { type: "BASE", name: "Base salary", amount: "1200.00" },
    { type: "ALLOWANCE", name: "Housing", amount: "100.00" },
    { type: "DEDUCTION", name: "Tax", amount: "200.00" },
  ]);
  await add("1", day(30), base("5000.00"));
  await add("2", "2024-06-01", [
    { type: "BASE", name: "Base salary", amount: "2000.00" },
    { type: "BONUS", name: "Spot", amount: "500.00" },
  ]);
  await add("3", "2024-06-01", base("3000.00"));
  await add("4", "2023-01-01", base("100000.00"), "INR");
  await add("4", "2025-03-01", base("120000.00"), "INR");
  await add("5", "2024-01-01", base("4000.00"), "EUR");
  await add("5", "2025-02-01", base("4400.00"), "USD");
  await add("6", "2024-01-01", base("9000.00"));
  await add("8", day(10), base("3000.00"));

  const agent = await loginAs(`ana-${suffix}@example.com`);

  async function cleanup() {
    const all = Object.values(ids);
    await prisma.salaryRecord.deleteMany({ where: { employeeId: { in: all } } });
    await prisma.employee.deleteMany({ where: { id: { in: all } } });
    await prisma.department.deleteMany({ where: { id: { in: [deptA.id, deptB.id] } } });
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
  }
  return { suffix, designation, deptA: deptA.id, deptB: deptB.id, userId: user.id, agent, ids, cleanup };
}
```

If the existing test files import without the `.ts` suffix (`../../app`, as `salary.directory.test.ts` does), follow that style in test files; in non-test source use `.ts` suffixes like the rest of `src`.

`analytics.summary.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && bun run test -- analytics.summary` (the DB must be running: `docker compose up -d postgres`). Expected: FAIL (404 on every request / module missing).

- [ ] **Step 3: Implement**

`analytics.dates.ts`:

```ts
export const todayUtc = () => new Date().toISOString().slice(0, 10);
export const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

/** Inclusive list of `YYYY-MM` between the months of two `YYYY-MM-DD` dates. */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const endYear = Number(to.slice(0, 4));
  const endMonth = Number(to.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/** First day of the month `count` months before the month of `date`. */
export function startOfMonthsAgo(date: string, count: number): string {
  const total = Number(date.slice(0, 4)) * 12 + (Number(date.slice(5, 7)) - 1) - count;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}
```

`analytics.schema.ts`:

```ts
import { z } from "zod";

import { COUNTRY_CODES } from "../../lib/countries.ts";
import { CURRENCY_CODES } from "../../lib/currencies.ts";
import { todayUtc } from "./analytics.dates.ts";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value, "Not a real date");

const filterShape = {
  departmentId: z.uuid().optional(),
  country: z.enum(COUNTRY_CODES).optional(),
  designation: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ALL"]).default("ACTIVE"),
  currency: z.enum(CURRENCY_CODES).optional(),
  basis: z.enum(["gross", "net"]).default("gross"),
};

export const asOfQuerySchema = z
  .object({ ...filterShape, asOf: dateString.default(() => todayUtc()) })
  .strict();

export const groupsQuerySchema = z
  .object({
    ...filterShape,
    asOf: dateString.default(() => todayUtc()),
    groupBy: z.enum(["department", "country", "designation"]).default("department"),
  })
  .strict();

export const trendsQuerySchema = z
  .object({ ...filterShape, from: dateString.optional(), to: dateString.optional() })
  .strict();

export const emptyQuerySchema = z.object({}).strict();

export type AsOfQuery = z.infer<typeof asOfQuerySchema>;
export type GroupsQuery = z.infer<typeof groupsQuerySchema>;
export type TrendsQuery = z.infer<typeof trendsQuerySchema>;
```

`analytics.sql.ts`:

```ts
import { Prisma } from "../../../generated/prisma/client.ts";

export interface PopulationFilters {
  departmentId?: string | undefined;
  country?: string | undefined;
  designation?: string | undefined;
  status: "ACTIVE" | "INACTIVE" | "ALL";
  basis: "gross" | "net";
  asOf: string;
}

export function employeeConditions(f: PopulationFilters, ignoreStatus = false): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (f.departmentId) parts.push(Prisma.sql`e."departmentId" = ${f.departmentId}`);
  if (f.country) parts.push(Prisma.sql`e.country = ${f.country}`);
  if (f.designation) parts.push(Prisma.sql`e.designation = ${f.designation}`);
  if (!ignoreStatus && f.status !== "ALL") parts.push(Prisma.sql`e.status = ${f.status}::"EmployeeStatus"`);
  return Prisma.join(parts, " AND ");
}

/**
 * CTE list (no leading WITH):
 *  emp: filtered employees; rec: salary totals per record up to asOf;
 *  cur: each employee's latest record as of asOf with the basis value `v`;
 *  pop: salaried employees with group keys. Not currency-filtered: callers filter currency.
 */
export function populationCtes(f: PopulationFilters, ignoreStatus = false): Prisma.Sql {
  const value = f.basis === "net" ? Prisma.sql`(r.gross - r.deductions)` : Prisma.sql`r.gross`;
  return Prisma.sql`
    emp AS (
      SELECT e.id, e."departmentId", e.country, e.designation, e.status
      FROM "Employee" e
      WHERE ${employeeConditions(f, ignoreStatus)}
    ),
    rec AS (
      SELECT sr.id, sr."employeeId", sr.currency, sr."effectiveDate",
        COALESCE(SUM(sc.amount) FILTER (WHERE sc.type <> 'DEDUCTION'), 0) AS gross,
        COALESCE(SUM(sc.amount) FILTER (WHERE sc.type = 'DEDUCTION'), 0) AS deductions
      FROM "SalaryRecord" sr
      JOIN emp ON emp.id = sr."employeeId"
      LEFT JOIN "SalaryComponent" sc ON sc."salaryRecordId" = sr.id
      WHERE sr."effectiveDate" <= ${f.asOf}::date
      GROUP BY sr.id
    ),
    cur AS (
      SELECT DISTINCT ON (r."employeeId") r."employeeId", r.currency, ${value} AS v
      FROM rec r
      ORDER BY r."employeeId", r."effectiveDate" DESC
    ),
    pop AS (
      SELECT emp.id, emp."departmentId", emp.country, emp.designation, cur.currency, cur.v
      FROM emp JOIN cur ON cur."employeeId" = emp.id
    )`;
}

/** Columns in order: count, total, average, median, min, max, p25, p75. Use with `FROM pop ... GROUP BY`. */
export const STATS_COLUMNS = Prisma.sql`
  COUNT(*)::int AS count,
  ROUND(SUM(v), 2)::text AS total,
  ROUND(AVG(v), 2)::text AS average,
  ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY v))::numeric, 2)::text AS median,
  ROUND(MIN(v), 2)::text AS min,
  ROUND(MAX(v), 2)::text AS max,
  ROUND((percentile_cont(0.25) WITHIN GROUP (ORDER BY v))::numeric, 2)::text AS p25,
  ROUND((percentile_cont(0.75) WITHIN GROUP (ORDER BY v))::numeric, 2)::text AS p75`;
```

`analytics.service.ts` (Task 1 part):

```ts
import { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import { STATS_COLUMNS, populationCtes, employeeConditions, type PopulationFilters } from "./analytics.sql.ts";

export interface CurrencyStats {
  currency: string;
  count: number;
  total: string;
  average: string;
  median: string;
  min: string;
  max: string;
  p25: string;
  p75: string;
}

export interface SummaryFilters extends PopulationFilters {
  currency?: string | undefined;
}

export async function getSummary(f: SummaryFilters) {
  const [stats, counts, byStatus] = await Promise.all([
    prisma.$queryRaw<CurrencyStats[]>(Prisma.sql`
      WITH ${populationCtes(f)}
      SELECT currency, ${STATS_COLUMNS} FROM pop GROUP BY currency ORDER BY 2 DESC, currency`),
    prisma.$queryRaw<{ total: number; salaried: number }[]>(Prisma.sql`
      WITH ${populationCtes(f)}
      SELECT (SELECT COUNT(*) FROM emp)::int AS total, (SELECT COUNT(*) FROM cur)::int AS salaried`),
    prisma.$queryRaw<{ status: string; n: number }[]>(Prisma.sql`
      SELECT e.status::text AS status, COUNT(*)::int AS n FROM "Employee" e
      WHERE ${employeeConditions(f, true)} GROUP BY e.status`),
  ]);

  const active = byStatus.find((r) => r.status === "ACTIVE")?.n ?? 0;
  const inactive = byStatus.find((r) => r.status === "INACTIVE")?.n ?? 0;
  const { total, salaried } = counts[0] ?? { total: 0, salaried: 0 };

  return {
    asOf: f.asOf,
    basis: f.basis,
    headcount: { total: active + inactive, active, inactive, withSalary: salaried, withoutSalary: total - salaried },
    currencies: stats.filter((s) => !f.currency || s.currency === f.currency),
  };
}
```

Note `ORDER BY 2 DESC` is the `count` column (position 2 after `currency`).

`analytics.controller.ts`:

```ts
import type { Request, Response } from "express";

import { asOfQuerySchema } from "./analytics.schema.ts";
import { getSummary } from "./analytics.service.ts";

export async function summaryHandler(request: Request, response: Response) {
  const query = asOfQuerySchema.parse(request.query);
  response.status(200).json(await getSummary(query));
}
```

`analytics.routes.ts`:

```ts
import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.ts";
import { summaryHandler } from "./analytics.controller.ts";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth, requireRole("ADMIN", "HR_MANAGER"));

analyticsRouter.get("/summary", summaryHandler);
```

`app.ts`: add `import { analyticsRouter } from "./modules/analytics/analytics.routes.ts";` and `app.use("/api/analytics", analyticsRouter);` after the salaries mount.

- [ ] **Step 4: Run tests and typecheck**

Run: `cd backend && bun run test -- analytics.summary && bun run typecheck`. Expected: all PASS. If a SQL column/table name differs from the guess in Global Constraints, fix the SQL (check the migration), not the tests. If `percentile_cont` values differ in the last digit from the expectations, re-derive by hand before changing anything (the expectations in the test were computed from the fixture comments).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/analytics backend/src/app.ts
git commit -m "feat(backend): add analytics summary endpoint"
```

---

### Task 2: Distribution, groups and filter-options endpoints

**Files:**
- Modify: `backend/src/modules/analytics/analytics.service.ts`, `analytics.controller.ts`, `analytics.routes.ts`
- Create: `backend/src/modules/analytics/analytics.groups.test.ts`

**Interfaces:**
- Consumes: Task 1 (`populationCtes`, `STATS_COLUMNS`, `CurrencyStats`, `AsOfQuery`, `GroupsQuery`, `createAnalyticsFixture`, `getSummary` filter shape).
- Produces: `getDistribution(f)`, `getGroups(f)`, `getFilterOptions()`; `GroupRow`, `GroupCurrency = CurrencyStats | { currency: string; count: number; suppressed: true }`, `MIN_GROUP_SIZE = 3`.

- [ ] **Step 1: Write failing tests**

`analytics.groups.test.ts` (same fixture header/`beforeAll`/`afterAll` as the summary test):

```ts
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
```

Expected values check: dept A USD values 1300, 2500, 3000: p25 = 1300 + 0.5*(2500-1300) = 1900.00; p75 = 2500 + 0.5*500 = 2750.00; average 6800/3 = 2266.67.

- [ ] **Step 2: Run to verify failure** — `bun run test -- analytics.groups`. Expected: FAIL (404).

- [ ] **Step 3: Implement**

Append to `analytics.service.ts`:

```ts
export const MIN_GROUP_SIZE = 3;
const BUCKETS = 10;

export interface DistributionBucket {
  from: string;
  to: string;
  count: number;
}

const centsToString = (cents: number) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;

export async function getDistribution(f: SummaryFilters) {
  const rows = await prisma.$queryRaw<{ currency: string; lo: string; hi: string; bucket: number; n: number }[]>(Prisma.sql`
    WITH ${populationCtes(f)},
    pc AS (SELECT currency, ROUND(v * 100)::bigint AS c FROM pop ${f.currency ? Prisma.sql`WHERE currency = ${f.currency}` : Prisma.empty}),
    bounds AS (SELECT currency, MIN(c) AS lo, MAX(c) AS hi FROM pc GROUP BY currency)
    SELECT p.currency, b.lo::text AS lo, b.hi::text AS hi,
      CASE WHEN b.hi = b.lo THEN 0
           ELSE LEAST(LEAST(${BUCKETS}, b.hi - b.lo + 1) - 1, ((p.c - b.lo) * LEAST(${BUCKETS}, b.hi - b.lo + 1)) / (b.hi - b.lo))
      END::int AS bucket,
      COUNT(*)::int AS n
    FROM pc p JOIN bounds b ON b.currency = p.currency
    GROUP BY p.currency, b.lo, b.hi, 3
    ORDER BY p.currency, 3`);

  const byCurrency = new Map<string, { lo: number; hi: number; counts: Map<number, number> }>();
  for (const row of rows) {
    const entry = byCurrency.get(row.currency) ?? { lo: Number(row.lo), hi: Number(row.hi), counts: new Map() };
    entry.counts.set(row.bucket, row.n);
    byCurrency.set(row.currency, entry);
  }

  const currencies = [...byCurrency.entries()].map(([currency, { lo, hi, counts }]) => {
    const span = hi - lo;
    const k = span === 0 ? 1 : Math.min(BUCKETS, span + 1);
    const edge = (i: number) => lo + Math.ceil((i * span) / k);
    const buckets: DistributionBucket[] = [];
    let count = 0;
    for (let i = 0; i < k; i += 1) {
      const n = counts.get(i) ?? 0;
      count += n;
      buckets.push({
        from: centsToString(edge(i)),
        to: centsToString(i === k - 1 ? hi : edge(i + 1) - 1),
        count: n,
      });
    }
    return { currency, count, buckets };
  });
  currencies.sort((a, b) => b.count - a.count || a.currency.localeCompare(b.currency));

  return { asOf: f.asOf, basis: f.basis, currencies };
}

export interface SuppressedStats {
  currency: string;
  count: number;
  suppressed: true;
}
export type GroupCurrency = CurrencyStats | SuppressedStats;
export interface GroupRow {
  key: string;
  label: string;
  headcount: number;
  withoutSalary: number;
  currencies: GroupCurrency[];
}

export interface GroupFilters extends SummaryFilters {
  groupBy: "department" | "country" | "designation";
}

export async function getGroups(f: GroupFilters): Promise<{ asOf: string; basis: string; groupBy: string; groups: GroupRow[] }> {
  const empKey = {
    department: Prisma.sql`emp."departmentId"`,
    country: Prisma.sql`emp.country`,
    designation: Prisma.sql`emp.designation`,
  }[f.groupBy];
  const popKey = {
    department: Prisma.sql`"departmentId"`,
    country: Prisma.sql`country`,
    designation: Prisma.sql`designation`,
  }[f.groupBy];

  const [heads, stats] = await Promise.all([
    prisma.$queryRaw<{ key: string; headcount: number }[]>(Prisma.sql`
      WITH ${populationCtes(f)}
      SELECT ${empKey}::text AS key, COUNT(*)::int AS headcount FROM emp GROUP BY 1`),
    prisma.$queryRaw<(CurrencyStats & { key: string })[]>(Prisma.sql`
      WITH ${populationCtes(f)}
      SELECT ${popKey}::text AS key, currency, ${STATS_COLUMNS} FROM pop GROUP BY 1, currency ORDER BY 1, 3 DESC, currency`),
  ]);

  const labels = new Map<string, string>();
  if (f.groupBy === "department") {
    const depts = await prisma.department.findMany({ select: { id: true, name: true } });
    for (const d of depts) labels.set(d.id, d.name);
  }

  const salariedByKey = new Map<string, number>();
  const currenciesByKey = new Map<string, GroupCurrency[]>();
  for (const { key, ...stat } of stats) {
    salariedByKey.set(key, (salariedByKey.get(key) ?? 0) + stat.count);
    if (f.currency && stat.currency !== f.currency) continue;
    const entry: GroupCurrency = stat.count < MIN_GROUP_SIZE ? { currency: stat.currency, count: stat.count, suppressed: true } : stat;
    currenciesByKey.set(key, [...(currenciesByKey.get(key) ?? []), entry]);
  }

  const groups: GroupRow[] = heads.map(({ key, headcount }) => ({
    key,
    label: labels.get(key) ?? key,
    headcount,
    withoutSalary: headcount - (salariedByKey.get(key) ?? 0),
    currencies: [...(currenciesByKey.get(key) ?? [])].sort((a, b) => b.count - a.count || a.currency.localeCompare(b.currency)),
  }));
  groups.sort((a, b) => b.headcount - a.headcount || a.label.localeCompare(b.label));

  return { asOf: f.asOf, basis: f.basis, groupBy: f.groupBy, groups };
}

export async function getFilterOptions() {
  const [departments, countries, designations, currencies] = await Promise.all([
    prisma.department.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ distinct: ["country"], select: { country: true }, orderBy: { country: "asc" } }),
    prisma.employee.findMany({ distinct: ["designation"], select: { designation: true }, orderBy: { designation: "asc" } }),
    prisma.salaryRecord.findMany({ distinct: ["currency"], select: { currency: true }, orderBy: { currency: "asc" } }),
  ]);
  return {
    departments,
    countries: countries.map((c) => c.country),
    designations: designations.map((d) => d.designation),
    currencies: currencies.map((c) => c.currency),
  };
}
```

`ORDER BY p.currency, 3` / `GROUP BY ..., 3` use the output-column position (the CASE alias `bucket` is column 5 in the SELECT list; if Postgres rejects the positional reference in GROUP BY because it is an expression involving aggregates-free columns, group by the full CASE expression via a subquery instead: compute `bucket` in a subselect and `GROUP BY currency, lo, hi, bucket`). Choose whichever passes the tests; positions must be recounted against the final SELECT list.

Controller additions:

```ts
import { asOfQuerySchema, groupsQuerySchema } from "./analytics.schema.ts";
import { getDistribution, getFilterOptions, getGroups, getSummary } from "./analytics.service.ts";

export async function distributionHandler(request: Request, response: Response) {
  response.status(200).json(await getDistribution(asOfQuerySchema.parse(request.query)));
}
export async function groupsHandler(request: Request, response: Response) {
  response.status(200).json(await getGroups(groupsQuerySchema.parse(request.query)));
}
export async function filterOptionsHandler(_request: Request, response: Response) {
  response.status(200).json(await getFilterOptions());
}
```

Routes: add `analyticsRouter.get("/distribution", distributionHandler); .get("/groups", groupsHandler); .get("/filters", filterOptionsHandler);`.

- [ ] **Step 4: Run tests and typecheck** — `bun run test -- analytics && bun run typecheck`. Expected PASS (summary tests still pass).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/analytics
git commit -m "feat(backend): add analytics distribution, groups and filter options"
```

---

### Task 3: Trends and dashboard endpoints

**Files:**
- Modify: `backend/src/modules/analytics/analytics.service.ts`, `analytics.controller.ts`, `analytics.routes.ts`
- Create: `backend/src/modules/analytics/dashboard.service.ts`
- Create: `backend/src/modules/analytics/dashboard.routes.ts`
- Create: `backend/src/modules/analytics/analytics.trends.test.ts`
- Create: `backend/src/modules/analytics/dashboard.test.ts`
- Modify: `backend/src/app.ts` (mount `/api/dashboard`)

**Interfaces:**
- Consumes: Task 1-2 services and fixture; `computeTotals`, `computeChange` from `../salaries/salary.calc.ts` (read `computeChange`'s return type first; `changePercent` below is its `grossPercent`, a `string | null`).
- Produces: `getTrends(f)`, `getDashboard()`, `getRecentRevisions(limit)`; mounted `dashboardRouter`.

- [ ] **Step 1: Write failing tests**

`analytics.trends.test.ts` (fixture header as before):

```ts
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
    for (const qs of [`&from=2025-02-01&to=2025-01-01`, `&to=${future}`, `&from=2015-01-01&to=2025-12-31`, `&from=2024-02-30`]) {
      const res = await fx.agent.get(`/api/analytics/trends?designation=${d}${qs}`);
      expect(res.status, qs).toBe(400);
    }
  });

  it("requires auth and role", async () => {
    expect((await request(app).get("/api/analytics/trends")).status).toBe(401);
    expect((await request(app).get("/api/analytics/trends").set("Cookie", forgedCookie("EMPLOYEE"))).status).toBe(403);
  });
});
```

(The "defaults" test depends on no fixture record falling in the last 12 months relative to the real clock; fixture dates are 2023-2025 and today is later than 2026-10; if the real date is ever before 2026-10-01 the assertion must be loosened to only check `to`. Keep the `to` assertion; for the `currencies` assertion use `expect(res.body.currencies.every((c: any) => c.months.length === 12 || c.months.length === 13)).toBe(true)` if it fails because of date drift.)

`dashboard.test.ts` (fixture header as before; imports `getRecentRevisions` from `./dashboard.service`):

```ts
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
```

Expected shape notes: `changePercent` is formatted by `computeChange` (check whether it returns `"30.00"` or `"30"`; use whichever it produces and keep the two-decimal string convention: format with `.toFixed(2)` if needed). The seeded dev DB may contain other revisions; the tests only look at fixture employees.

- [ ] **Step 2: Run to verify failure** — `bun run test -- analytics.trends dashboard`. Expected FAIL.

- [ ] **Step 3: Implement**

Append to `analytics.service.ts`:

```ts
import { monthsBetween, startOfMonthsAgo, todayUtc } from "./analytics.dates.ts";
import { AppError } from "../../middleware/error.middleware.ts";
import type { TrendsQuery } from "./analytics.schema.ts";

const MAX_TREND_MONTHS = 60;

export interface TrendMonth {
  month: string;
  revisionCount: number;
  newSalaryCount: number;
  avgChangePercent: string | null;
  avgGross: string | null;
  avgNet: string | null;
}

export async function getTrends(query: TrendsQuery) {
  const today = todayUtc();
  const to = query.to ?? today;
  const from = query.from ?? startOfMonthsAgo(to, 11);
  if (to > today) throw new AppError(400, "`to` cannot be in the future", "INVALID_DATE_RANGE");
  if (from > to) throw new AppError(400, "`from` must not be after `to`", "INVALID_DATE_RANGE");
  const months = monthsBetween(from, to);
  if (months.length > MAX_TREND_MONTHS) {
    throw new AppError(400, `Range may not exceed ${MAX_TREND_MONTHS} months`, "INVALID_DATE_RANGE");
  }

  const f: PopulationFilters = { ...query, asOf: to };
  // The window needs every record per employee (to find the previous one); the range is applied in the outer query.
  const rows = await prisma.$queryRaw<
    { currency: string; month: string; revisionCount: number; newSalaryCount: number; avgChange: string | null; avgGross: string; avgNet: string }[]
  >(Prisma.sql`
    WITH emp AS (
      SELECT e.id FROM "Employee" e WHERE ${employeeConditions(f)}
    ),
    sums AS (
      SELECT sr.id, sr."employeeId", sr.currency, sr."effectiveDate",
        COALESCE(SUM(sc.amount) FILTER (WHERE sc.type <> 'DEDUCTION'), 0) AS gross,
        COALESCE(SUM(sc.amount) FILTER (WHERE sc.type = 'DEDUCTION'), 0) AS deductions
      FROM "SalaryRecord" sr
      JOIN emp ON emp.id = sr."employeeId"
      LEFT JOIN "SalaryComponent" sc ON sc."salaryRecordId" = sr.id
      GROUP BY sr.id
    ),
    seq AS (
      SELECT s.*, ${query.basis === "net" ? Prisma.sql`(s.gross - s.deductions)` : Prisma.sql`s.gross`} AS v,
        ROW_NUMBER() OVER w AS rn,
        LAG(s.currency) OVER w AS prev_currency,
        LAG(${query.basis === "net" ? Prisma.sql`(s.gross - s.deductions)` : Prisma.sql`s.gross`}) OVER w AS prev_v
      FROM sums s
      WINDOW w AS (PARTITION BY s."employeeId" ORDER BY s."effectiveDate")
    )
    SELECT currency,
      to_char("effectiveDate", 'YYYY-MM') AS month,
      (COUNT(*) FILTER (WHERE rn > 1))::int AS "revisionCount",
      (COUNT(*) FILTER (WHERE rn = 1))::int AS "newSalaryCount",
      ROUND(AVG(CASE WHEN rn > 1 AND prev_currency = currency AND prev_v > 0 THEN (v - prev_v) / prev_v * 100 END), 2)::text AS "avgChange",
      ROUND(AVG(gross), 2)::text AS "avgGross",
      ROUND(AVG(gross - deductions), 2)::text AS "avgNet"
    FROM seq
    WHERE "effectiveDate" BETWEEN ${from}::date AND ${to}::date
      ${query.currency ? Prisma.sql`AND currency = ${query.currency}` : Prisma.empty}
    GROUP BY currency, 2
    ORDER BY currency, 2`);

  const byCurrency = new Map<string, Map<string, TrendMonth>>();
  const totals = new Map<string, number>();
  for (const row of rows) {
    const map = byCurrency.get(row.currency) ?? new Map<string, TrendMonth>();
    map.set(row.month, {
      month: row.month,
      revisionCount: row.revisionCount,
      newSalaryCount: row.newSalaryCount,
      avgChangePercent: row.avgChange,
      avgGross: row.avgGross,
      avgNet: row.avgNet,
    });
    byCurrency.set(row.currency, map);
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.revisionCount + row.newSalaryCount);
  }

  const currencies = [...byCurrency.entries()]
    .sort(([a], [b]) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0) || a.localeCompare(b))
    .map(([currency, map]) => ({
      currency,
      months: months.map(
        (month): TrendMonth =>
          map.get(month) ?? { month, revisionCount: 0, newSalaryCount: 0, avgChangePercent: null, avgGross: null, avgNet: null },
      ),
    }));

  return { from, to, basis: query.basis, currencies };
}
```

Expected USD currency ordering in the trends test does not matter (tests look up by currency). `to_char("effectiveDate", ...)` on a `date` column works. The mid-column positional `GROUP BY ... 2` refers to the `month` expression; use the expression if rejected.

`dashboard.service.ts`:

```ts
import { prisma } from "../../lib/prisma.ts";
import { computeChange, computeTotals } from "../salaries/salary.calc.ts";
import { todayUtc } from "./analytics.dates.ts";
import { getGroups, getSummary, type GroupFilters, type GroupRow } from "./analytics.service.ts";

const RECENT = 5;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export async function getRecentRevisions(limit = RECENT) {
  const ids = await prisma.$queryRaw<{ id: string }[]>`
    SELECT sr.id FROM "SalaryRecord" sr
    WHERE EXISTS (
      SELECT 1 FROM "SalaryRecord" p
      WHERE p."employeeId" = sr."employeeId" AND p."effectiveDate" < sr."effectiveDate"
    )
    ORDER BY sr."createdAt" DESC, sr.id
    LIMIT ${limit}`;
  if (ids.length === 0) return [];

  const records = await prisma.salaryRecord.findMany({
    where: { id: { in: ids.map((r) => r.id) } },
    include: {
      components: { select: { type: true, amount: true } },
      employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  const order = new Map(ids.map((r, i) => [r.id, i]));
  records.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const price = (components: { type: "BASE" | "ALLOWANCE" | "BONUS" | "DEDUCTION"; amount: { toFixed(n: number): string } }[]) =>
    computeTotals(components.map((c) => ({ type: c.type, amount: c.amount.toFixed(2) })));

  return Promise.all(
    records.map(async (r) => {
      const previous = await prisma.salaryRecord.findFirst({
        where: { employeeId: r.employeeId, effectiveDate: { lt: r.effectiveDate } },
        orderBy: { effectiveDate: "desc" },
        include: { components: { select: { type: true, amount: true } } },
      });
      const totals = price(r.components);
      const change = previous
        ? computeChange(
            { currency: previous.currency, totals: price(previous.components) },
            { currency: r.currency, totals },
          )
        : null;
      return {
        id: r.id,
        employee: { id: r.employee.id, employeeCode: r.employee.employeeCode, name: `${r.employee.firstName} ${r.employee.lastName}` },
        currency: r.currency,
        effectiveDate: isoDate(r.effectiveDate),
        gross: totals.gross,
        changePercent: change ? change.grossPercent : null,
        reason: r.reason,
        createdBy: r.createdBy,
        createdAt: r.createdAt.toISOString(),
      };
    }),
  );
}

export async function getDashboard() {
  const asOf = todayUtc();
  const filters = { status: "ACTIVE", basis: "gross", asOf } as const;
  const groupFilters = (groupBy: GroupFilters["groupBy"]): GroupFilters => ({ ...filters, groupBy });

  const [summary, deptGroups, countryGroups, departments, totalEmployees, recentEmployees, recentRevisions] = await Promise.all([
    getSummary(filters),
    getGroups(groupFilters("department")),
    getGroups(groupFilters("country")),
    prisma.department.findMany({ select: { id: true, name: true } }),
    prisma.employee.count(),
    prisma.employee.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: RECENT,
      select: { id: true, employeeCode: true, firstName: true, lastName: true, joiningDate: true, createdAt: true, department: { select: { name: true } } },
    }),
    getRecentRevisions(RECENT),
  ]);

  // Dashboard shows total and average only; suppressed entries (fewer than 3) are not applicable here, so re-expose stats.
  const money = (group: GroupRow) =>
    group.currencies.map((c) => ("suppressed" in c ? { currency: c.currency, count: c.count, total: null, average: null } : { currency: c.currency, count: c.count, total: c.total, average: c.average }));
```

STOP: the dashboard must show department totals even for small groups (the spec's suppression applies to `/groups` comparison). `getGroups` therefore needs a `suppress` switch. Implement it as: `GroupFilters` gains optional `suppress?: boolean` (default `true`); when `false`, entries are never suppressed. Dashboard passes `suppress: false`, and `money` is then simply `group.currencies` mapped to `{ currency, count, total, average }` (all entries are full `CurrencyStats`). Update `getGroups` and add a test in `analytics.groups.test.ts` is NOT needed (dashboard test covers it: dept B shows `INR count 1 total 120000.00`). Final `getDashboard`:

```ts
  const mapMoney = (group: GroupRow) =>
    group.currencies.flatMap((c) => ("suppressed" in c ? [] : [{ currency: c.currency, count: c.count, total: c.total, average: c.average }]));

  const deptByKey = new Map(deptGroups.groups.map((g) => [g.key, g]));
  const departmentRows = departments
    .map((d) => {
      const g = deptByKey.get(d.id);
      return { id: d.id, name: d.name, headcount: g?.headcount ?? 0, currencies: g ? mapMoney(g) : [] };
    })
    .sort((a, b) => b.headcount - a.headcount || a.name.localeCompare(b.name));

  return {
    asOf,
    metrics: {
      totalEmployees,
      activeEmployees: summary.headcount.active,
      departmentCount: departments.length,
      countryCount: countryGroups.groups.length,
      withoutSalary: summary.headcount.withoutSalary,
      currencies: summary.currencies,
    },
    departments: departmentRows,
    countries: countryGroups.groups.map((g) => ({ country: g.key, headcount: g.headcount, currencies: mapMoney(g) })),
    recentEmployees: recentEmployees.map((e) => ({
      id: e.id,
      employeeCode: e.employeeCode,
      name: `${e.firstName} ${e.lastName}`,
      department: e.department.name,
      joiningDate: isoDate(e.joiningDate),
      createdAt: e.createdAt.toISOString(),
    })),
    recentRevisions,
  };
}
```

(Use this final form; discard the in-progress `money` helper above. Write the file cleanly with the `suppress` flag.) In `getGroups`, change the suppression line to `const entry: GroupCurrency = f.suppress !== false && stat.count < MIN_GROUP_SIZE ? {...suppressed} : stat;`. `summary.headcount.active` counts active employees under the `ACTIVE` default (the headcount ignores the status filter anyway); `summary.headcount.withoutSalary` is for active employees.

Controller additions: `trendsHandler` (`trendsQuerySchema.parse(request.query)` → `getTrends`), `dashboardHandler` (`emptyQuerySchema.parse(request.query)` → `getDashboard()`). Routes: `analyticsRouter.get("/trends", trendsHandler)`; `dashboard.routes.ts`:

```ts
import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.ts";
import { dashboardHandler } from "./analytics.controller.ts";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth, requireRole("ADMIN", "HR_MANAGER"));
dashboardRouter.get("/", dashboardHandler);
```

`app.ts`: import `dashboardRouter`, add `app.use("/api/dashboard", dashboardRouter);`.

- [ ] **Step 4: Run all backend tests and typecheck** — `cd backend && bun run test && bun run typecheck`. Expected: all PASS (previous 16 files / 194 tests plus the new ones).

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "feat(backend): add analytics trends and dashboard endpoints"
```

---

### Task 4: Frontend foundation: Recharts, API client, chart components

**Files:**
- Modify: `frontend/package.json` (via `bun add recharts`), `frontend/vitest.setup.ts` (ResizeObserver stub)
- Create: `frontend/app/lib/analytics-api.ts`, `analytics-api.test.ts`
- Create: `frontend/app/components/analytics/ClientOnly.tsx`, `ChartCard.tsx`, `BarChartCard.tsx`, `DistributionChart.tsx`, `TrendChart.tsx`, `MetricCard.tsx`, plus `analytics-components.test.tsx`

**Interfaces:**
- Consumes: `apiCall` from `~/lib/employees-api` (returns `{ ok: true; data } | { ok: false; status; message }`; 401 already redirects), `formatMoney` from `~/lib/currencies`.
- Produces:
  - Types: `CurrencyStats`, `SuppressedStats`, `Result<T>`, `AnalyticsParams`, `SummaryData`, `DistributionData`, `GroupsData`, `TrendsData`, `FilterOptions`, `DashboardData`.
  - `DEFAULT_ANALYTICS_PARAMS`, `parseAnalyticsParams(sp)`, `toAnalyticsSearchParams(params)`, `hasActiveAnalyticsFilters(params)`.
  - Fetchers `getAnalyticsSummary / getAnalyticsDistribution / getAnalyticsGroups / getAnalyticsTrends / getAnalyticsFilters / getDashboard (request, params?)`.
  - Components: `ClientOnly({children: () => ReactNode})`, `ChartCard({title, subtitle?, result? , empty?, children})`, `BarChartCard`, `DistributionChart`, `TrendChart`, `MetricCard({label, value, hint?})`.

- [ ] **Step 1: Install and stub**

Run: `cd frontend && bun add recharts`. Append to `frontend/vitest.setup.ts` (read it first; keep existing content):

```ts
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
```

- [ ] **Step 2: Write failing tests**

`analytics-api.test.ts`:

```ts
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
```

Adjust the `toAnalyticsSearchParams` key order expectation to the actual `Object.keys(DEFAULT_ANALYTICS_PARAMS)` order you define (the order below: departmentId, country, designation, status, currency, basis, asOf, from, to, groupBy).

`analytics-components.test.tsx` (RTL):

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ChartCard from "./ChartCard";
import MetricCard from "./MetricCard";
import DistributionChart from "./DistributionChart";

describe("MetricCard", () => {
  it("shows label, value and hint", () => {
    render(<MetricCard label="Active employees" value="7" hint="of 8 total" />);
    expect(screen.getByText("Active employees")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("of 8 total")).toBeInTheDocument();
  });
});

describe("ChartCard", () => {
  it("renders children when ok and not empty", () => {
    render(<ChartCard title="T" result={{ ok: true, data: 1 }}><p>content</p></ChartCard>);
    expect(screen.getByText("content")).toBeInTheDocument();
  });
  it("shows an inline error for a failed result without rendering children", () => {
    render(<ChartCard title="T" result={{ ok: false, status: 500, message: "boom" }}><p>content</p></ChartCard>);
    expect(screen.getByRole("alert")).toHaveTextContent(/could not load/i);
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });
  it("shows the empty message when empty", () => {
    render(<ChartCard title="T" empty="No salary data for these filters"><p>content</p></ChartCard>);
    expect(screen.getByText("No salary data for these filters")).toBeInTheDocument();
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });
});

describe("DistributionChart", () => {
  it("exposes an accessible label and a data table with the buckets", () => {
    render(<DistributionChart currency="USD" buckets={[{ from: "1300.00", to: "1609.99", count: 1 }, { from: "1610.00", to: "1919.99", count: 0 }]} />);
    expect(screen.getByRole("img", { name: /salary distribution in USD/i })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText(/1,300\.00/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify failure** — `cd frontend && bun run test -- analytics`. Expected FAIL (modules missing).

- [ ] **Step 4: Implement**

`app/lib/analytics-api.ts`:

```ts
import { COUNTRIES } from "~/lib/countries";
import { CURRENCIES } from "~/lib/currencies";
import { apiCall } from "~/lib/employees-api";

export interface CurrencyStats {
  currency: string;
  count: number;
  total: string;
  average: string;
  median: string;
  min: string;
  max: string;
  p25: string;
  p75: string;
}
export interface SuppressedStats {
  currency: string;
  count: number;
  suppressed: true;
}
export type Result<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

export type StatusFilter = "ACTIVE" | "INACTIVE" | "ALL";
export type Basis = "gross" | "net";
export type GroupBy = "department" | "country" | "designation";

export interface AnalyticsParams {
  departmentId: string;
  country: string;
  designation: string;
  status: StatusFilter;
  currency: string;
  basis: Basis;
  asOf: string;
  from: string;
  to: string;
  groupBy: GroupBy;
}

export const DEFAULT_ANALYTICS_PARAMS: AnalyticsParams = {
  departmentId: "",
  country: "",
  designation: "",
  status: "ACTIVE",
  currency: "",
  basis: "gross",
  asOf: "",
  from: "",
  to: "",
  groupBy: "department",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const realDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value ? value : "";

export function parseAnalyticsParams(sp: URLSearchParams): AnalyticsParams {
  const get = (key: string) => sp.get(key) ?? "";
  const status = get("status");
  const basis = get("basis");
  const groupBy = get("groupBy");
  return {
    departmentId: UUID.test(get("departmentId")) ? get("departmentId") : "",
    country: COUNTRIES.some((c) => c.code === get("country")) ? get("country") : "",
    designation: get("designation").trim().slice(0, 100),
    status: status === "ACTIVE" || status === "INACTIVE" || status === "ALL" ? status : "ACTIVE",
    currency: CURRENCIES.some((c) => c.code === get("currency")) ? get("currency") : "",
    basis: basis === "net" ? "net" : "gross",
    asOf: realDate(get("asOf")),
    from: realDate(get("from")),
    to: realDate(get("to")),
    groupBy: groupBy === "country" || groupBy === "designation" ? groupBy : "department",
  };
}

export function toAnalyticsSearchParams(params: Partial<AnalyticsParams>): URLSearchParams {
  const merged = { ...DEFAULT_ANALYTICS_PARAMS, ...params };
  const search = new URLSearchParams();
  for (const key of Object.keys(DEFAULT_ANALYTICS_PARAMS) as (keyof AnalyticsParams)[]) {
    const value = merged[key];
    if (value === "" || value === DEFAULT_ANALYTICS_PARAMS[key]) continue;
    search.set(key, value);
  }
  return search;
}

/** Filters that narrow the data; `basis` and `groupBy` are view options and do not count. */
export function hasActiveAnalyticsFilters(params: AnalyticsParams): boolean {
  const { basis: _basis, groupBy: _groupBy, ...filters } = params;
  const { basis: _b, groupBy: _g, ...defaults } = DEFAULT_ANALYTICS_PARAMS;
  return (Object.keys(filters) as (keyof typeof filters)[]).some((key) => filters[key] !== defaults[key]);
}

const COMMON = ["departmentId", "country", "designation", "status", "currency", "basis"] as const;
type Key = keyof AnalyticsParams;

function fetchAnalytics<T>(request: Request, path: string, params: AnalyticsParams, extra: readonly Key[]) {
  const search = new URLSearchParams();
  for (const key of [...COMMON, ...extra] as Key[]) {
    const value = params[key];
    if (value !== "") search.set(key, value);
  }
  const query = search.toString();
  return apiCall<T>(request, `${path}${query ? `?${query}` : ""}`);
}

export interface SummaryData {
  asOf: string;
  basis: Basis;
  headcount: { total: number; active: number; inactive: number; withSalary: number; withoutSalary: number };
  currencies: CurrencyStats[];
}
export interface DistributionData {
  asOf: string;
  basis: Basis;
  currencies: { currency: string; count: number; buckets: { from: string; to: string; count: number }[] }[];
}
export interface GroupRow {
  key: string;
  label: string;
  headcount: number;
  withoutSalary: number;
  currencies: (CurrencyStats | SuppressedStats)[];
}
export interface GroupsData {
  asOf: string;
  basis: Basis;
  groupBy: GroupBy;
  groups: GroupRow[];
}
export interface TrendMonth {
  month: string;
  revisionCount: number;
  newSalaryCount: number;
  avgChangePercent: string | null;
  avgGross: string | null;
  avgNet: string | null;
}
export interface TrendsData {
  from: string;
  to: string;
  basis: Basis;
  currencies: { currency: string; months: TrendMonth[] }[];
}
export interface FilterOptions {
  departments: { id: string; name: string }[];
  countries: string[];
  designations: string[];
  currencies: string[];
}
export interface MoneyLine {
  currency: string;
  count: number;
  total: string;
  average: string;
}
export interface DashboardData {
  asOf: string;
  metrics: {
    totalEmployees: number;
    activeEmployees: number;
    departmentCount: number;
    countryCount: number;
    withoutSalary: number;
    currencies: CurrencyStats[];
  };
  departments: { id: string; name: string; headcount: number; currencies: MoneyLine[] }[];
  countries: { country: string; headcount: number; currencies: MoneyLine[] }[];
  recentEmployees: { id: string; employeeCode: string; name: string; department: string; joiningDate: string; createdAt: string }[];
  recentRevisions: {
    id: string;
    employee: { id: string; employeeCode: string; name: string };
    currency: string;
    effectiveDate: string;
    gross: string;
    changePercent: string | null;
    reason: string;
    createdBy: { id: string; name: string };
    createdAt: string;
  }[];
}

export const getAnalyticsSummary = (r: Request, p: AnalyticsParams) => fetchAnalytics<SummaryData>(r, "/api/analytics/summary", p, ["asOf"]);
export const getAnalyticsDistribution = (r: Request, p: AnalyticsParams) => fetchAnalytics<DistributionData>(r, "/api/analytics/distribution", p, ["asOf"]);
export const getAnalyticsGroups = (r: Request, p: AnalyticsParams) => fetchAnalytics<GroupsData>(r, "/api/analytics/groups", p, ["asOf", "groupBy"]);
export const getAnalyticsTrends = (r: Request, p: AnalyticsParams) => fetchAnalytics<TrendsData>(r, "/api/analytics/trends", p, ["from", "to"]);
export const getAnalyticsFilters = (r: Request) => apiCall<FilterOptions>(r, "/api/analytics/filters");
export const getDashboard = (r: Request) => apiCall<DashboardData>(r, "/api/dashboard");
```

Check `apiCall`'s real generic and result type in `employees-api.ts`; if it already exports a `Result` type, import it instead of redefining and keep one definition. The `asOf` sent as empty is skipped (`value !== ""`).

`ClientOnly.tsx`:

```tsx
import { useEffect, useState, type ReactNode } from "react";

/** Recharts needs a browser to measure its container; render nothing during SSR. */
export default function ClientOnly({ children, fallback = null }: { children: () => ReactNode; fallback?: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <>{mounted ? children() : fallback}</>;
}
```

`ChartCard.tsx`:

```tsx
import { Alert, Box, Paper, Typography } from "@mui/material";
import type { ReactNode } from "react";

import type { Result } from "~/lib/analytics-api";

interface Props {
  title: string;
  subtitle?: string;
  result?: Result<unknown>;
  empty?: string;
  children: ReactNode;
}

export default function ChartCard({ title, subtitle, result, empty, children }: Props) {
  return (
    <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
      <Typography variant="h6" component="h2">
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {subtitle}
        </Typography>
      )}
      {result && !result.ok ? (
        <Alert severity="error">Could not load {title.toLowerCase()}.</Alert>
      ) : empty ? (
        <Box sx={{ py: 4, textAlign: "center" }}>
          <Typography color="text.secondary">{empty}</Typography>
        </Box>
      ) : (
        children
      )}
    </Paper>
  );
}
```

`MetricCard.tsx`:

```tsx
import { Paper, Typography } from "@mui/material";

export default function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h4" component="p">
        {value}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Paper>
  );
}
```

`BarChartCard.tsx` (horizontal comparison bar; used for department/country/group charts):

```tsx
import { Box } from "@mui/material";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import ClientOnly from "./ClientOnly";

export interface BarDatum {
  label: string;
  value: number;
}

interface Props {
  data: BarDatum[];
  ariaLabel: string;
  valueLabel: string;
  formatValue?: (value: number) => string;
}

/** Values are chart-only floats (display); exact amounts are shown in the adjacent table. */
export default function BarChartCard({ data, ariaLabel, valueLabel, formatValue = String }: Props) {
  return (
    <Box role="img" aria-label={ariaLabel} sx={{ height: 280 }}>
      <ClientOnly>
        {() => (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" interval={0} tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={formatValue} width={72} />
              <Tooltip formatter={(value) => [formatValue(Number(value)), valueLabel]} />
              <Bar dataKey="value" name={valueLabel} fill="#1976d2" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ClientOnly>
    </Box>
  );
}
```

`DistributionChart.tsx` (chart + accessible table):

```tsx
import { Box, Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatMoney } from "~/lib/currencies";
import ClientOnly from "./ClientOnly";

interface Props {
  currency: string;
  buckets: { from: string; to: string; count: number }[];
}

export default function DistributionChart({ currency, buckets }: Props) {
  const data = buckets.map((b) => ({ label: `${b.from}`, range: `${formatMoney(b.from, currency)} – ${formatMoney(b.to, currency)}`, count: b.count }));
  return (
    <>
      <Box role="img" aria-label={`Salary distribution in ${currency}`} sx={{ height: 280 }}>
        <ClientOnly>
          {() => (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tickFormatter={(v) => formatMoney(String(v), currency)} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} width={40} />
                <Tooltip labelFormatter={(_l, payload) => payload?.[0]?.payload?.range ?? ""} formatter={(v) => [String(v), "Employees"]} />
                <Bar dataKey="count" name="Employees" fill="#1976d2" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ClientOnly>
      </Box>
      <Box sx={{ overflowX: "auto", mt: 1 }}>
        <Table size="small" aria-label={`Distribution buckets in ${currency}`}>
          <TableHead>
            <TableRow>
              <TableCell>Range ({currency})</TableCell>
              <TableCell align="right">Employees</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((d) => (
              <TableRow key={d.label}>
                <TableCell>{d.range}</TableCell>
                <TableCell align="right">{d.count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </>
  );
}
```

`TrendChart.tsx`:

```tsx
import { Box } from "@mui/material";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { TrendMonth } from "~/lib/analytics-api";
import ClientOnly from "./ClientOnly";

export default function TrendChart({ currency, months }: { currency: string; months: TrendMonth[] }) {
  const data = months.map((m) => ({
    month: m.month,
    revisions: m.revisionCount,
    change: m.avgChangePercent === null ? null : Number(m.avgChangePercent),
  }));
  return (
    <Box role="img" aria-label={`Salary revisions and average change over time in ${currency}`} sx={{ height: 300 }}>
      <ClientOnly>
        {() => (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" allowDecimals={false} width={40} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} width={48} />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="revisions" name="Revisions" fill="#1976d2" />
              <Line yAxisId="right" dataKey="change" name="Avg change %" stroke="#ed6c02" connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ClientOnly>
    </Box>
  );
}
```

- [ ] **Step 5: Run tests, typecheck, build** — `cd frontend && bun run test && bun run typecheck && bun run build`. Expected PASS; the build must succeed with Recharts imported (SSR safe because charts mount via `ClientOnly`). Fix any Recharts typing errors by following its exported prop types (formatters take `ValueType`, not `number`).

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/bun.lock frontend/vitest.setup.ts frontend/app
git commit -m "feat(frontend): add analytics API client and chart components"
```

(If the lockfile has another name, add whichever lockfile changed.)

---

### Task 5: Dashboard page

**Files:**
- Modify: `frontend/app/routes/dashboard.tsx`, `frontend/app/routes/dashboard.test.tsx`
- Create: `frontend/app/components/analytics/MoneyList.tsx`, `RecentActivity.tsx`, `dashboard-components.test.tsx`

**Interfaces:**
- Consumes: Task 4 (`getDashboard`, `DashboardData`, `MetricCard`, `ChartCard`, `BarChartCard`), `formatMoney`, `COUNTRIES` from `~/lib/countries` (`{code, name}`).
- Produces: `MoneyList({ lines: MoneyLine[]; empty?: string })`, `RecentActivity({ employees, revisions })`; the `/dashboard` loader returns `{ dashboard: DashboardData; userName: string }`... keep the existing authenticated-layout user greeting (`useRouteLoaderData(AUTHENTICATED_ROUTE_ID)`), and add `loader` returning `DashboardData`.

- [ ] **Step 1: Write failing tests**

Read the existing `dashboard.test.tsx` (it renders inside the authenticated route id). Rewrite it to render with a stubbed loader. The tests (adapt the router setup from the existing test and from `salaries.test.tsx`):

```tsx
const dashboard = {
  asOf: "2026-10-03",
  metrics: {
    totalEmployees: 8, activeEmployees: 7, departmentCount: 2, countryCount: 3, withoutSalary: 2,
    currencies: [
      { currency: "USD", count: 4, total: "11200.00", average: "2800.00", median: "2750.00", min: "1300.00", max: "4400.00", p25: "2200.00", p75: "3350.00" },
      { currency: "INR", count: 1, total: "120000.00", average: "120000.00", median: "120000.00", min: "120000.00", max: "120000.00", p25: "120000.00", p75: "120000.00" },
    ],
  },
  departments: [
    { id: "d2", name: "Engineering", headcount: 4, currencies: [{ currency: "USD", count: 1, total: "4400.00", average: "4400.00" }, { currency: "INR", count: 1, total: "120000.00", average: "120000.00" }] },
    { id: "d1", name: "Design", headcount: 3, currencies: [{ currency: "USD", count: 3, total: "6800.00", average: "2266.67" }] },
  ],
  countries: [{ country: "US", headcount: 4, currencies: [{ currency: "USD", count: 3, total: "6800.00", average: "2266.67" }] }],
  recentEmployees: [{ id: "e1", employeeCode: "EMP-0009", name: "Asha Rao", department: "Design", joiningDate: "2026-09-01", createdAt: "2026-10-02T10:00:00.000Z" }],
  recentRevisions: [{ id: "s1", employee: { id: "e1", employeeCode: "EMP-0001", name: "Asha Rao" }, currency: "USD", effectiveDate: "2026-10-01", gross: "1300.00", changePercent: "30.00", reason: "Annual review", createdBy: { id: "u1", name: "Hannah HR" }, createdAt: "2026-10-02T11:00:00.000Z" }],
};
```

Assertions: (a) metric cards show "Total employees 8", "Active employees 7", "Departments 2", "Countries 3", "Without salary 2"; (b) a salary card per currency shows `USD` and `INR` blocks each with total, average and median formatted via `formatMoney` (e.g. `$11,200.00`, `₹120,000.00`), and no combined total anywhere (assert there is no text matching `131200`); (c) department table lists Engineering with both currency lines and Design; (d) country table shows the country name ("United States") with the code resolved via `COUNTRIES`, falling back to the code; (e) recent employees and revisions render names, `+30.00%`, `Annual review`, `Hannah HR`; (f) empty data (no departments, no currencies, no recents) shows "No salary data yet" / "No recent activity" messages without crashing; (g) loader failure: a 500 from `/api/dashboard` makes the route's `ErrorBoundary` render "Could not load the dashboard" with a "Try again" link; (h) a 401 from the loader redirects to `/login`; (i) link "Open salary analytics" points to `/analytics`.

`dashboard-components.test.tsx`: `MoneyList` renders one line per currency with `count` employees; with no lines shows the `empty` text.

- [ ] **Step 2: Run to verify failure** — `bun run test -- dashboard`. Expected FAIL.

- [ ] **Step 3: Implement**

`MoneyList.tsx`:

```tsx
import { Box, Typography } from "@mui/material";

import type { MoneyLine } from "~/lib/analytics-api";
import { formatMoney } from "~/lib/currencies";

export default function MoneyList({ lines, empty = "No salary data" }: { lines: MoneyLine[]; empty?: string }) {
  if (lines.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {empty}
      </Typography>
    );
  }
  return (
    <Box>
      {lines.map((line) => (
        <Typography key={line.currency} variant="body2">
          <strong>{line.currency}</strong> total {formatMoney(line.total, line.currency)} · avg {formatMoney(line.average, line.currency)} ({line.count})
        </Typography>
      ))}
    </Box>
  );
}
```

`RecentActivity.tsx`: two `ChartCard`s side by side (MUI `Grid` or `Box` with CSS grid, matching how other pages lay out), a list of recent employees (name linking to `/employees/:id`, code, department, joining date) and a list of recent revisions (employee name linking to `/employees/:id`, `+X.XX%`/`-X.XX%` chip or "new currency" when `changePercent` is null, gross via `formatMoney`, effective date, reason, "by <createdBy.name>"). Empty lists show "No recent activity".

`dashboard.tsx`:
- `export async function loader({ request })`: `const result = await getDashboard(request); if (!result.ok) throw new Response(result.message, { status: result.status }); return result.data;`
- `ErrorBoundary` like `salaries.tsx` ("Could not load the dashboard. Please try again." with Try again link to `/dashboard`).
- Component: keep the signed-in greeting from the authenticated layout loader data (unchanged semantics), then:
  1. metric cards row (CSS grid, 1 column on xs, 2 on sm, 5 on lg): Total employees, Active employees, Departments, Countries, Without salary (hint "No current salary").
  2. "Salary overview" `ChartCard` (subtitle: `Active employees · gross per period · as of {asOf}`): one block per currency from `metrics.currencies` with currency code, `count` employees, total/average/median. If none: "No salary data yet" (via `empty`).
  3. Two-column: "By department" and "By country" `ChartCard`s, each with a `BarChartCard` of headcount (label = name / country name) and a table: name, employees, and a `MoneyList` cell. Subtitle "Active employees; each currency shown separately".
  4. `RecentActivity`.
  5. A "Open salary analytics" button linking to `/analytics`.
- Country labels: `COUNTRIES.find((c) => c.code === code)?.name ?? code`.

- [ ] **Step 4: Run tests, typecheck** — `bun run test && bun run typecheck`. Expected PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/app
git commit -m "feat(frontend): build dashboard overview"
```

---

### Task 6: Salary Analytics page, navigation and routes

**Files:**
- Create: `frontend/app/routes/analytics.tsx`, `analytics.test.tsx`
- Create: `frontend/app/components/analytics/AnalyticsFilters.tsx`, `GroupTable.tsx`, `StatCards.tsx`, `analytics-filters.test.tsx`, `group-table.test.tsx`
- Modify: `frontend/app/routes.ts` (add `route("analytics", "routes/analytics.tsx")`), `frontend/app/routes.test.ts`, `frontend/app/components/layout/AppLayout.tsx` (nav item `{ label: "Analytics", to: "/analytics" }` after Salaries), `frontend/app/components/layout/AppLayout.test.tsx`

**Interfaces:**
- Consumes: Task 4 lib/components; `PageHeader`; the `salaries.tsx` patterns (`latest` ref, `commit`/`update`, `useSearchParams`, `useNavigation`).
- Produces: route `/analytics`; `AnalyticsFilters({ params, options, onChange, onClear })`, `GroupTable({ groups, currency, groupBy, basis })`, `StatCards({ summary, currency, basis })`.

- [ ] **Step 1: Write failing tests**

`analytics-filters.test.tsx`: renders the filter bar with options `{ departments: [{id: DEPT, name: "Engineering"}], countries: ["US","IN"], designations: ["Engineer"], currencies: ["USD","INR"] }` and `params = DEFAULT_ANALYTICS_PARAMS` (with `currency: "USD"` shown as the effective one): selecting department calls `onChange({ departmentId: DEPT })`; selecting country calls `onChange({ country: "US" })`; selecting designation, status (`ALL`), currency (`INR`), basis (`net`), setting the as-of date and the from/to dates each call `onChange` with the matching key; the "Reset filters" button calls `onClear` and is disabled when `hasActiveAnalyticsFilters(params)` is false. Country options show names (via `COUNTRIES`) not just codes.

`group-table.test.tsx`: given groups from the backend example (dept A with a full USD stats entry, dept B with two suppressed entries), `currency="USD"`: shows label, employees, withoutSalary, count, average, median, min, max, total formatted with `formatMoney`; a suppressed row shows "Fewer than 3 salaried employees" and no amounts; a group with no entry in the selected currency shows "—"; heading text mentions the currency code and basis.

`analytics.test.tsx` (pattern from `salaries.test.tsx`: stub `fetch` by pathname):
1. Loader calls summary and filters first; with no `currency` param it picks the most populous currency from the summary and then calls distribution, groups and trends with `currency=USD` (assert on the seen URLs, and that the URL params `status`/`basis` defaults are omitted from API calls only when empty—`status=ACTIVE` and `basis=gross` ARE sent).
2. With `?currency=INR&country=US&basis=net&groupBy=country&asOf=2025-01-31&from=2024-01-01&to=2024-12-31` the five API calls carry exactly the params each endpoint accepts (`trends` gets from/to but not asOf/groupBy; `groups` gets asOf and groupBy).
3. Renders summary stat cards (count, total, average, median, min, max, p25, p75 with the currency code), the distribution table, the group table, and the trend chart label for the selected currency; the page states "as of 2026-10-03", the basis and the currency.
4. Changing a filter updates the URL (`useSearchParams`) and resets nothing else; "Reset filters" returns defaults (keeping `basis` and `groupBy`).
5. Empty data (summary with `currencies: []`): every panel shows "No salary data for these filters", and when filters are active the page offers Reset filters.
6. A failing distribution call (500) shows an inline error in that panel only; the other panels still render.
7. A failing summary call: summary panel shows its inline error; other panels still render with whatever currency was requested (`currency` empty is passed through).
8. 401 from any call redirects to `/login`.
9. Route registration: `routes.test.ts` expects `analytics` inside the authenticated layout; `AppLayout.test.tsx` expects an "Analytics" nav link that is selected on `/analytics`.

- [ ] **Step 2: Run to verify failure** — `bun run test -- analytics`. Expected FAIL.

- [ ] **Step 3: Implement**

`AnalyticsFilters.tsx`: MUI `TextField select` controls in a wrapping flex/grid container (match `SalaryDirectoryFilters.tsx` styling and label/aria conventions; read it first): Department, Country, Role (designation), Status (Active/Inactive/All), Currency (only the currencies in use; value is the effective currency), Basis (Gross/Net) plus date fields `type="date"`: "As of", "From", "To" (the `to` input has `max` = today). Date changes call `onChange` only for complete valid values or the empty string. A "Reset filters" button (`disabled` unless `hasActiveAnalyticsFilters(params)`). `onChange(patch: Partial<AnalyticsParams>)`.

`StatCards.tsx`: for the one selected currency show `MetricCard`s: Employees (count), Total, Average, Median, Min, Max, P25, P75, all `formatMoney(value, currency)`, plus a headcount line "{withSalary} with salary · {withoutSalary} without". Heading: `Compensation summary (gross|net, CCY)`.

`GroupTable.tsx`: table described in the test. Column "Employees" = `headcount`, "Salaried" = entry `count` for the currency, then Avg, Median, Min, Max, Total. Header label by `groupBy` (Department/Country/Role). Country keys render with names via `COUNTRIES`. Suppressed row: one cell spanning the money columns: "Fewer than 3 salaried employees".

`analytics.tsx`:
- `loader({ request })` as in the Task 4 interface notes: parse params; `Promise.all([getAnalyticsSummary(request, params), getAnalyticsFilters(request)])`; `currency = params.currency || (summary.ok ? summary.data.currencies[0]?.currency ?? "" : "")`; `scoped = { ...params, currency }`; `Promise.all([distribution, groups, trends])` with `scoped`; return `{ params, currency, summary, distribution, groups, trends, filters }` (the `Result` objects, so one failed panel does not fail the page). Do not throw for failed panels; the filter options failing renders empty option lists and an inline alert above the filters. (A 401 is already turned into a redirect by `apiCall`.)
- `ErrorBoundary`: "Could not load analytics. Please try again."
- Component: `PageHeader title="Salary analytics"`, a caption "Amounts are per period as entered. Currencies are never combined; showing {currency}."; `AnalyticsFilters` wired with the `latest`-ref `commit/update` pattern from `salaries.tsx` using `toAnalyticsSearchParams` (changing a filter writes it to the URL; when the user changes any filter other than `currency` itself, clear nothing; changing `currency` just sets it); `LinearProgress` while `navigation.state === "loading"`; panels in a responsive grid (1 column below `md`, 2 above, summary and trends full width):
  1. `StatCards` in a `ChartCard` ("Compensation summary").
  2. Distribution (`ChartCard` "Salary distribution", `DistributionChart` for the entry of the selected currency; `empty` when the summary/distribution has no entry for the currency).
  3. "Compare groups" with a `ToggleButtonGroup` (Department | Country | Role) that sets `groupBy`, a `BarChartCard` of average per group (skip suppressed groups, `formatValue` via `formatMoney` of the number with the currency), and `GroupTable`.
  4. "Salary trends" with `TrendChart` for the selected currency and a compact table (month, revisions, new salaries, avg change %, avg gross) for months with any activity; subtitle states the `from – to` range returned by the API.
  5. Role breakdown: reuse the groups call only when `groupBy === "designation"`; otherwise a separate small `GroupTable` is NOT fetched (the toggle covers roles). Do not add a sixth API call.
- Empty/error states: each `ChartCard` gets `result={...}` for its own call and `empty="No salary data for these filters"` when that call has no data for the currency.

`routes.ts`: add `route("analytics", "routes/analytics.tsx"),` after salaries. Update `routes.test.ts` and `AppLayout.tsx`/`AppLayout.test.tsx` accordingly (read both tests first).

- [ ] **Step 4: Run all frontend checks** — `cd frontend && bun run test && bun run typecheck && bun run build`. Expected PASS.

- [ ] **Step 5: Manual API/SSR pass** (record in the summary; do not claim a browser click-through): start the backend (`cd backend && bun run dev`, port per `.env`) and frontend dev server, log in with curl and a cookie jar, request `/dashboard`, `/analytics`, `/analytics?currency=INR&basis=net`, and the six API endpoints against the seeded database; confirm HTTP 200, expected content, and that unauthenticated `/dashboard` and `/analytics` redirect to `/login`. Stop the servers afterwards.

- [ ] **Step 6: Commit**

```bash
git add frontend/app
git commit -m "feat(frontend): add salary analytics page and navigation"
```

---

### Task 7: Documentation, implementation summary, status

**Files:**
- Create: `docs/implementation/2026-10-03-dashboard-analytics-summary.md`
- Modify: `docs/04-implementation-status.md`, `docs/02-tech-stack-and-architecture.md` (Recharts now installed; analytics approach), `docs/03-modules-and-use-cases.md` (only where behaviour diverges: no Optional conversion, no level, median in dashboard now implemented, recent changes derive from `createdAt`), `README.md`, `backend/README.md`, `frontend/README.md`, `docs/superpowers/specs/2026-10-03-dashboard-analytics-design.md` (record the implementation deltas: one shared currency selector in the filter bar instead of per-panel selectors; `suppress` flag; `departmentCount` = number of departments; `countryCount` = distinct countries of active employees).

- [ ] **Step 1:** Write the summary following the structure of `2026-10-03-salary-directory-summary.md` (read it): original task (the prompt, condensed), what was completed, endpoints and query params with example responses, metric definitions (current salary rule, basis, per-currency, stats, buckets, trends, suppression), filters, frontend routes and components, decisions and rulings, tests (exact final counts from the last runs, manual pass description and that no real-browser click-through was done), known limitations (the spec's section 8 plus: `percentile_cont` uses double precision then rounds to 2 dp; charts are chart-only floats, exact values in tables; `getRecentRevisions` does up to 5 follow-up queries; no caching), and next steps (Import/Export, Audit, level field, configured reporting currency).
- [ ] **Step 2:** Update the status table (Dashboard and Analytics: ✅ Done, link to the summary; "Last updated: 2026-10-03"), the READMEs (endpoint tables, `/dashboard` and `/analytics`), and the docs listed above.
- [ ] **Step 3:** Re-run the full checks and paste the counts into the summary: backend `bun run typecheck && bun run test`; frontend `bun run typecheck && bun run test && bun run build`.
- [ ] **Step 4: Commit**

```bash
git add docs README.md backend/README.md frontend/README.md
git commit -m "docs: document dashboard and analytics, add implementation summary"
```
