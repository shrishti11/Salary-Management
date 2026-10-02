# Salary Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let HR record, revise and review employee compensation with an append-only history, shown on the employee profile.

**Architecture:** New backend module `modules/salaries` (pure calc, zod schema, service with a locking transaction, controller, routes) mounted at `/api/employees/:id/salaries`. Two new tables (`SalaryRecord`, `SalaryComponent`). Frontend adds a Compensation section and a form dialog to the existing profile route; the profile loader and action are extended, no new routes.

**Tech Stack:** Express 5, Prisma 7 + PostgreSQL, zod 4, Vitest + Supertest; React Router v8 (SSR loaders/actions), MUI v9, React Hook Form + zod, RTL.

**Spec:** `docs/superpowers/specs/2026-10-02-salary-management-design.md`

## Global Constraints

- No new dependencies. No lint script exists; none is added.
- Backend modules follow `modules/employees`: `.routes/.controller/.service/.schema.ts`; imports use the `.ts` extension; business logic and Prisma calls live in the service.
- Errors are `AppError(status, message, code)` and render as `{ error: { message, code? } }`.
- Money: DB `Decimal(14,2)`; in transit and in UI state it is a decimal **string**; arithmetic is in integer cents, never floats.
- Gross = BASE + ALLOWANCE + BONUS. Net = gross - DEDUCTION. Net must not be negative.
- Exactly one BASE per record; (type, name) unique per record, case-insensitive; BASE amount > 0; other amounts >= 0.
- `effectiveDate` is `YYYY-MM-DD`; "today" is UTC on the server. Date must be >= employee joining date and strictly after the newest existing record. Equal to the newest date -> 409 `DUPLICATE_EFFECTIVE_DATE`; earlier than it -> 409 `EFFECTIVE_DATE_NOT_AFTER_LATEST` (ruling: gives both codes meaning).
- Reason: 3-500 chars, required when a record already exists (400 `REASON_REQUIRED`), optional for the first record (default `"Initial salary"`).
- Inactive employee: reads allowed, creates -> 409 `EMPLOYEE_INACTIVE`.
- Salary router: `requireAuth` + `requireRole("ADMIN","HR_MANAGER")`. No PATCH/DELETE routes.
- Never commit on `main`; work is on `feature/salary-management`. Commit after each task.
- Backend checks: `cd backend && bun run typecheck && bun run test`. Frontend: `cd frontend && bun run typecheck && bun run test && bun run build`.
- Supported currencies (both ends): USD EUR GBP INR AUD CAD SGD AED JPY CNY BRL CHF SEK NZD ZAR MXN NOK DKK HKD KRW.

## Review Focus

1. Two simultaneous revisions for the same employee and date: exactly one 201, one 409 (Task 3 test).
2. Amounts like `0.1 + 0.2`, `1e3`, `-5`, `5.555`, `""`: sum exactly or reject; no float drift (Tasks 2, 4).
3. Salary id belonging to another employee: 404, never leaks the record (Task 3).
4. Currency changes between revisions: change-from-previous is `null`, not a bogus number (Tasks 2, 3).
5. Salary API fails or returns 403 while the profile itself loads: profile still renders, section degrades (Task 6).

---

### Task 1: Schema, migration, currencies, seed

**Files:**
- Modify: `backend/prisma/schema.prisma` (append models, add relation fields)
- Create: `backend/prisma/migrations/<timestamp>_add_salary_records/migration.sql` (generated, then appended)
- Create: `backend/src/lib/currencies.ts`
- Modify: `backend/prisma/seed.ts`

**Interfaces:**
- Produces: Prisma models `SalaryRecord`, `SalaryComponent`, enum `SalaryComponentType`; `CURRENCY_CODES` (readonly tuple) and `CurrencyCode` from `backend/src/lib/currencies.ts`.

- [ ] **Step 1: Edit the schema.** In `Employee` add `salaryRecords SalaryRecord[]`; in `User` add `salaryRecords SalaryRecord[]`. Append the two models and the enum exactly as in spec section 3 (`SalaryComponentType`, `SalaryRecord` with `@@unique([employeeId, effectiveDate])` and `@@index([effectiveDate])`, `SalaryComponent` with `@@unique([salaryRecordId, type, name])`).

- [ ] **Step 2: Create the migration without applying it.**

Run: `cd backend && bunx prisma migrate dev --create-only --name add_salary_records`
Expected: new folder under `prisma/migrations/`.

- [ ] **Step 3: Append DB guards** to the end of the generated `migration.sql`:

```sql
ALTER TABLE "SalaryComponent" ADD CONSTRAINT "SalaryComponent_amount_nonneg" CHECK ("amount" >= 0);
CREATE UNIQUE INDEX "SalaryComponent_one_base_per_record" ON "SalaryComponent" ("salaryRecordId") WHERE "type" = 'BASE';
```

- [ ] **Step 4: Apply and check for drift.**

Run: `cd backend && bunx prisma migrate dev && bunx prisma migrate dev --create-only --name drift_check`
Expected: the second command reports "Already in sync" and creates nothing. If it generates a migration that drops the partial index, delete that generated folder, delete the partial-unique-index line from the first migration, re-run `bunx prisma migrate reset --force`, and rely on schema + service validation for "one BASE" (note this in the summary doc).

- [ ] **Step 5: Create `backend/src/lib/currencies.ts`:**

```ts
export const CURRENCY_CODES = [
  "USD", "EUR", "GBP", "INR", "AUD", "CAD", "SGD", "AED", "JPY", "CNY",
  "BRL", "CHF", "SEK", "NZD", "ZAR", "MXN", "NOK", "DKK", "HKD", "KRW",
] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];
```

- [ ] **Step 6: Seed salaries.** In `seed.ts`, after the employee loop and before `$disconnect`, add (admin `user` already exists in scope):

```ts
  const sampleSalaries = [
    { employeeCode: "EMP-0001", currency: "INR", records: [
      { date: "2021-03-15", reason: "Initial salary", base: "1800000.00", extras: [["ALLOWANCE", "Housing", "300000.00"], ["DEDUCTION", "Provident fund", "120000.00"]] },
      { date: "2023-04-01", reason: "Annual review", base: "2200000.00", extras: [["ALLOWANCE", "Housing", "360000.00"], ["BONUS", "Performance", "200000.00"], ["DEDUCTION", "Provident fund", "144000.00"]] },
    ] },
    { employeeCode: "EMP-0002", currency: "USD", records: [
      { date: "2020-07-01", reason: "Initial salary", base: "70000.00", extras: [] },
      { date: "2022-07-01", reason: "Promotion", base: "82000.00", extras: [["BONUS", "Signing", "5000.00"]] },
    ] },
    { employeeCode: "EMP-0003", currency: "GBP", records: [
      { date: "2019-11-20", reason: "Initial salary", base: "55000.00", extras: [["ALLOWANCE", "Transport", "2400.00"]] },
    ] },
  ] as const;
  for (const { employeeCode, currency, records } of sampleSalaries) {
    const employee = await prisma.employee.findUnique({ where: { employeeCode } });
    if (!employee) continue;
    if ((await prisma.salaryRecord.count({ where: { employeeId: employee.id } })) > 0) continue;
    for (const record of records) {
      await prisma.salaryRecord.create({
        data: {
          employeeId: employee.id,
          currency,
          effectiveDate: new Date(`${record.date}T00:00:00.000Z`),
          reason: record.reason,
          createdById: user.id,
          components: {
            create: [
              { type: "BASE", name: "Base salary", amount: record.base },
              ...record.extras.map(([type, name, amount]) => ({ type, name, amount })),
            ],
          },
        },
      });
    }
  }
  console.log("Seeded sample salary records");
```

- [ ] **Step 7: Verify.**

Run: `cd backend && bun run db:seed && bun run db:seed && bun run typecheck && bun run test`
Expected: seed runs twice without error (second is a no-op for salaries); typecheck clean; existing tests still pass.

- [ ] **Step 8: Commit.**

```bash
git add backend/prisma backend/src/lib/currencies.ts
git commit -m "feat(backend): add salary record schema, migration, currencies and seed"
```

---

### Task 2: Salary calculation and validation schema (pure)

**Files:**
- Create: `backend/src/modules/salaries/salary.calc.ts`
- Create: `backend/src/modules/salaries/salary.schema.ts`
- Test: `backend/src/modules/salaries/salary.calc.test.ts`, `backend/src/modules/salaries/salary.schema.test.ts`

**Interfaces:**
- Produces from `salary.calc.ts`:
  - `type ComponentType = "BASE" | "ALLOWANCE" | "BONUS" | "DEDUCTION"`
  - `interface ComponentAmount { type: ComponentType; amount: string }`
  - `toCents(amount: string): number`, `formatCents(cents: number): string`
  - `computeTotals(components: ComponentAmount[]): { gross: string; deductions: string; net: string; netCents: number }`
  - `computeChange(prev: { currency: string; totals: {gross: string; net: string} }, curr: same): { gross: string; net: string; grossPercent: string } | null` (null when currency differs)
- Produces from `salary.schema.ts`: `createSalarySchema`, `type CreateSalaryInput`, `employeeIdParamSchema` (`{ id }`), `salaryParamsSchema` (`{ id, salaryId }`), `COMPONENT_TYPES`.

- [ ] **Step 1: Write failing calc tests** (`salary.calc.test.ts`):

```ts
import { describe, expect, it } from "vitest";

import { computeChange, computeTotals, formatCents, toCents } from "./salary.calc.ts";

describe("toCents / formatCents", () => {
  it("parses whole and fractional amounts exactly", () => {
    expect(toCents("5000")).toBe(500000);
    expect(toCents("5000.5")).toBe(500050);
    expect(toCents("0.10")).toBe(10);
    expect(toCents("0.1") + toCents("0.2")).toBe(30);
  });
  it("formats with two decimals and a sign", () => {
    expect(formatCents(500050)).toBe("5000.50");
    expect(formatCents(5)).toBe("0.05");
    expect(formatCents(-1250)).toBe("-12.50");
  });
});

describe("computeTotals", () => {
  it("adds base, allowances and bonuses and subtracts deductions", () => {
    const totals = computeTotals([
      { type: "BASE", amount: "1000.00" },
      { type: "ALLOWANCE", amount: "200.10" },
      { type: "BONUS", amount: "99.90" },
      { type: "DEDUCTION", amount: "300.00" },
    ]);
    expect(totals).toEqual({ gross: "1300.00", deductions: "300.00", net: "1000.00", netCents: 100000 });
  });
  it("reports a negative net", () => {
    const totals = computeTotals([{ type: "BASE", amount: "10" }, { type: "DEDUCTION", amount: "10.01" }]);
    expect(totals.netCents).toBe(-1);
  });
});

describe("computeChange", () => {
  const prev = { currency: "USD", totals: { gross: "1000.00", net: "900.00" } };
  it("returns differences and gross percent", () => {
    expect(computeChange(prev, { currency: "USD", totals: { gross: "1100.00", net: "950.00" } })).toEqual({
      gross: "100.00",
      net: "50.00",
      grossPercent: "10.00",
    });
  });
  it("handles decreases", () => {
    expect(computeChange(prev, { currency: "USD", totals: { gross: "900.00", net: "800.00" } })?.gross).toBe("-100.00");
  });
  it("is null across currencies", () => {
    expect(computeChange(prev, { currency: "EUR", totals: { gross: "1100.00", net: "950.00" } })).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect failure.** `cd backend && bunx vitest run src/modules/salaries/salary.calc.test.ts` -> FAIL (module missing).

- [ ] **Step 3: Implement `salary.calc.ts`:**

```ts
export type ComponentType = "BASE" | "ALLOWANCE" | "BONUS" | "DEDUCTION";
export interface ComponentAmount {
  type: ComponentType;
  amount: string;
}

/** `amount` must already be validated as `\d+(\.\d{1,2})?`. */
export function toCents(amount: string): number {
  const [whole = "0", fraction = ""] = amount.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function computeTotals(components: ComponentAmount[]) {
  let earnings = 0;
  let deductions = 0;
  for (const { type, amount } of components) {
    if (type === "DEDUCTION") deductions += toCents(amount);
    else earnings += toCents(amount);
  }
  const netCents = earnings - deductions;
  return { gross: formatCents(earnings), deductions: formatCents(deductions), net: formatCents(netCents), netCents };
}

interface Priced {
  currency: string;
  totals: { gross: string; net: string };
}

export function computeChange(prev: Priced, curr: Priced) {
  if (prev.currency !== curr.currency) return null;
  const prevGross = toCents(prev.totals.gross);
  const grossDelta = toCents(curr.totals.gross) - prevGross;
  const netDelta = toCents(curr.totals.net) - toCents(prev.totals.net);
  const percent = prevGross === 0 ? 0 : Math.round((grossDelta / prevGross) * 10000) / 100;
  return { gross: formatCents(grossDelta), net: formatCents(netDelta), grossPercent: percent.toFixed(2) };
}
```

Note: `toCents` is only called on non-negative validated strings, but `computeChange` passes strings from `formatCents` that may be negative (`net`). Make `toCents` sign-aware: if the string starts with `-`, return `-toCents(rest)`. Add that line and a test `expect(toCents("-12.50")).toBe(-1250)`.

- [ ] **Step 4: Run, expect pass.** Same command -> PASS.

- [ ] **Step 5: Write failing schema tests** (`salary.schema.test.ts`). Helper `ok = (o = {}) => ({ currency: "USD", effectiveDate: "2025-01-01", reason: "Annual review", components: [{ type: "BASE", name: "Base salary", amount: "1000" }], ...o })`. Cases, each `createSalarySchema.safeParse(...)`:
  - valid input passes; currency is uppercased (`"usd"` -> `"USD"`); reason trimmed; omitted reason passes (output `reason` undefined).
  - rejects: unsupported currency `"XXX"`; impossible date `"2025-02-30"`; non-date `"01/01/2025"`; reason `"ab"`; reason of 501 chars; empty components; no BASE; two BASE; BASE amount `"0"`; amounts `"-5"`, `"1e3"`, `"5.555"`, `""`, `"1234567890123"` (13 digits); duplicate `(ALLOWANCE,"Housing")` and `(ALLOWANCE,"housing")`; 31 components; blank component name; unknown top-level key; unknown component key.
  - accepts the same name under two different types.
  - `employeeIdParamSchema` rejects `"not-a-uuid"`; `salaryParamsSchema` requires both uuids.

- [ ] **Step 6: Implement `salary.schema.ts`:**

```ts
import { z } from "zod";

import { CURRENCY_CODES } from "../../lib/currencies.ts";

export const COMPONENT_TYPES = ["BASE", "ALLOWANCE", "BONUS", "DEDUCTION"] as const;

const amountSchema = z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/, "Invalid amount");

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Invalid date");

const componentSchema = z
  .object({
    type: z.enum(COMPONENT_TYPES),
    name: z.string().trim().min(1).max(100),
    amount: amountSchema,
  })
  .strict();

export const createSalarySchema = z
  .object({
    currency: z.string().trim().toUpperCase().pipe(z.enum(CURRENCY_CODES)),
    effectiveDate: dateSchema,
    reason: z.string().trim().min(3).max(500).optional(),
    components: z.array(componentSchema).min(1).max(30),
  })
  .strict()
  .superRefine((value, ctx) => {
    const bases = value.components.filter((c) => c.type === "BASE");
    if (bases.length !== 1) ctx.addIssue({ code: "custom", message: "Exactly one BASE component is required", path: ["components"] });
    if (bases[0] && Number(bases[0].amount) <= 0) ctx.addIssue({ code: "custom", message: "Base salary must be greater than 0", path: ["components"] });
    const seen = new Set<string>();
    for (const { type, name } of value.components) {
      const key = `${type}:${name.toLowerCase()}`;
      if (seen.has(key)) ctx.addIssue({ code: "custom", message: "Duplicate component", path: ["components"] });
      seen.add(key);
    }
  });

export type CreateSalaryInput = z.infer<typeof createSalarySchema>;

export const employeeIdParamSchema = z.object({ id: z.uuid() });
export const salaryParamsSchema = z.object({ id: z.uuid(), salaryId: z.uuid() });
```

- [ ] **Step 7: Run all salary unit tests, typecheck.** `cd backend && bunx vitest run src/modules/salaries && bun run typecheck` -> PASS.

- [ ] **Step 8: Commit.**

```bash
git add backend/src/modules/salaries
git commit -m "feat(backend): add salary calculation helpers and validation schema"
```

---

### Task 3: Salary service, controller, routes and API tests

**Files:**
- Create: `backend/src/modules/salaries/salary.service.ts`, `salary.controller.ts`, `salary.routes.ts`
- Modify: `backend/src/app.ts` (mount router)
- Test: `backend/src/modules/salaries/salary.routes.test.ts`

**Interfaces:**
- Consumes: `computeTotals`, `computeChange`, `formatCents` (Task 2); `createSalarySchema`, `employeeIdParamSchema`, `salaryParamsSchema` (Task 2); `AppError`; `prisma`.
- Produces: `GET /api/employees/:id/salaries` -> `{ current: SalaryDto | null, scheduled: SalaryDto | null, history: SalaryDto[] }`; `POST` -> 201 `{ salary: SalaryDto }`; `GET /:salaryId` -> `{ salary: SalaryDto }`.
- `SalaryDto = { id, employeeId, currency, effectiveDate, reason, createdAt, createdBy: {id,name}, components: {id,type,name,amount}[], totals: {gross,deductions,net}, changeFromPrevious: {gross,net,grossPercent} | null, status: "CURRENT"|"SCHEDULED"|"PREVIOUS" }`.

- [ ] **Step 1: Write the failing API tests** (`salary.routes.test.ts`). Setup mirrors `employee.routes.test.ts`: `SUFFIX`, `createTestUser`, `loginAs`; `beforeAll` creates a department and a helper `makeEmployee(overrides)` that uses `prisma.employee.create` with `joiningDate: new Date("2020-01-01T00:00:00.000Z")`, unique code/email, tracking created ids. `afterAll` deletes in this order: `salaryRecord.deleteMany({ where: { employeeId: { in: ids } } })`, employees, department, user, `$disconnect`. Helpers: `const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)`; `body = (o = {}) => ({ currency: "USD", effectiveDate: "2024-01-01", components: [{ type: "BASE", name: "Base salary", amount: "1000.00" }], ...o })`; `post = (id, b) => agent.post(`/api/employees/${id}/salaries`).send(b)`. Cases:
  - auth: 401 on GET/POST without cookie; 403 with `forgedCookie("VIEWER")`; an ADMIN user (`createTestUser(adminEmail, "ADMIN")` + `loginAs`) can POST and GET.
  - empty employee: GET -> `{ current: null, scheduled: null, history: [] }`.
  - initial create: 201, `salary.reason === "Initial salary"`, `createdBy.name === "Test User"`, totals correct for BASE 1000 + ALLOWANCE 200 + DEDUCTION 100 (gross `1200.00`, deductions `100.00`, net `1100.00`), `changeFromPrevious === null`, `status === "CURRENT"`.
  - revision: second POST with `effectiveDate: "2025-01-01"`, base 1200, reason `"Annual review"` -> 201 with `changeFromPrevious.gross === "200.00"`, `grossPercent === "20.00"`; GET history length 2, newest first, `current.id` is the new one, the old record is `PREVIOUS` and unchanged (still has its original components and reason).
  - revision without reason -> 400 `REASON_REQUIRED`.
  - same date as latest -> 409 `DUPLICATE_EFFECTIVE_DATE`; earlier date -> 409 `EFFECTIVE_DATE_NOT_AFTER_LATEST`; history length unchanged.
  - date before joining date (`"2019-12-31"`) -> 400 `EFFECTIVE_DATE_BEFORE_JOINING`.
  - deductions exceed earnings -> 400 `NEGATIVE_NET`.
  - schema failures -> 400 `VALIDATION_ERROR` (two BASE rows; amount `"1e3"`; currency `"XXX"`; extra top-level key).
  - future-dated: record dated `day(30)` after one dated `"2024-01-01"` -> `scheduled.id` is the future record, `current.id` is the earlier one, future record `status === "SCHEDULED"`.
  - only future record exists: `current === null`, `scheduled` set.
  - currency change between revisions: second record `currency: "EUR"` -> `changeFromPrevious === null`.
  - inactive employee: set status INACTIVE via prisma -> POST 409 `EMPLOYEE_INACTIVE`; GET still 200 with history.
  - unknown employee uuid -> 404 `EMPLOYEE_NOT_FOUND` on GET and POST; malformed id -> 400.
  - `GET /:salaryId`: 200 for own record; 404 `SALARY_NOT_FOUND` when the id belongs to another employee; 404 for random uuid.
  - concurrency: `Promise.all([post(id, same), post(id, same)])` -> statuses sorted equal `[201, 409]`; history length 1.
  - `agent.patch(...)` and `agent.delete(...)` on `/api/employees/:id/salaries/:salaryId` -> 404.

- [ ] **Step 2: Run, expect failure.** `cd backend && bunx vitest run src/modules/salaries/salary.routes.test.ts` -> FAIL (routes 404).

- [ ] **Step 3: Implement `salary.service.ts`:**

```ts
import type { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import { AppError } from "../../middleware/error.middleware.ts";
import { computeChange, computeTotals } from "./salary.calc.ts";
import type { CreateSalaryInput } from "./salary.schema.ts";

const recordInclude = {
  components: true,
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.SalaryRecordInclude;

type RecordRow = Prisma.SalaryRecordGetPayload<{ include: typeof recordInclude }>;

const TYPE_ORDER = { BASE: 0, ALLOWANCE: 1, BONUS: 2, DEDUCTION: 3 } as const;
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const todayUtc = () => new Date().toISOString().slice(0, 10);
const employeeNotFound = () => new AppError(404, "Employee not found", "EMPLOYEE_NOT_FOUND");

function prismaCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function serialize(row: RecordRow, previous: RecordRow | undefined, today: string, currentId: string | null) {
  const components = [...row.components]
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.name.localeCompare(b.name))
    .map((c) => ({ id: c.id, type: c.type, name: c.name, amount: c.amount.toFixed(2) }));
  const totals = computeTotals(components);
  const view = { currency: row.currency, totals };
  const prevView = previous && {
    currency: previous.currency,
    totals: computeTotals(previous.components.map((c) => ({ type: c.type, amount: c.amount.toFixed(2) }))),
  };
  const date = isoDate(row.effectiveDate);
  return {
    id: row.id,
    employeeId: row.employeeId,
    currency: row.currency,
    effectiveDate: date,
    reason: row.reason,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    components,
    totals: { gross: totals.gross, deductions: totals.deductions, net: totals.net },
    changeFromPrevious: prevView ? computeChange(prevView, view) : null,
    status: date > today ? ("SCHEDULED" as const) : row.id === currentId ? ("CURRENT" as const) : ("PREVIOUS" as const),
  };
}

export type SalaryDto = ReturnType<typeof serialize>;

export async function getSalaries(employeeId: string) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!employee) throw employeeNotFound();

  const rows = await prisma.salaryRecord.findMany({
    where: { employeeId },
    orderBy: { effectiveDate: "asc" },
    include: recordInclude,
  });
  const today = todayUtc();
  const currentRow = [...rows].reverse().find((r) => isoDate(r.effectiveDate) <= today);
  const dtos = rows.map((row, i) => serialize(row, rows[i - 1], today, currentRow?.id ?? null));
  const history = [...dtos].reverse();
  const scheduled = history.filter((d) => d.status === "SCHEDULED").at(-1) ?? null;
  return { current: history.find((d) => d.status === "CURRENT") ?? null, scheduled, history };
}

export async function getSalary(employeeId: string, salaryId: string) {
  const { history } = await getSalaries(employeeId);
  const salary = history.find((d) => d.id === salaryId);
  if (!salary) throw new AppError(404, "Salary record not found", "SALARY_NOT_FOUND");
  return salary;
}

export async function createSalary(employeeId: string, userId: string, input: CreateSalaryInput) {
  const id = await prisma
    .$transaction(async (tx) => {
      // Serialise concurrent revisions for this employee.
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Employee" WHERE "id" = ${employeeId} FOR UPDATE`;
      if (locked.length === 0) throw employeeNotFound();

      const employee = await tx.employee.findUniqueOrThrow({ where: { id: employeeId } });
      if (employee.status !== "ACTIVE") {
        throw new AppError(409, "Inactive employees cannot receive salary changes", "EMPLOYEE_INACTIVE");
      }

      const latest = await tx.salaryRecord.findFirst({
        where: { employeeId },
        orderBy: { effectiveDate: "desc" },
        select: { effectiveDate: true },
      });

      if (latest && !input.reason) throw new AppError(400, "A reason is required for a salary revision", "REASON_REQUIRED");
      if (input.effectiveDate < isoDate(employee.joiningDate)) {
        throw new AppError(400, "Effective date cannot be before the joining date", "EFFECTIVE_DATE_BEFORE_JOINING");
      }
      if (latest) {
        const latestDate = isoDate(latest.effectiveDate);
        if (input.effectiveDate === latestDate) {
          throw new AppError(409, "A salary record already exists for this date", "DUPLICATE_EFFECTIVE_DATE");
        }
        if (input.effectiveDate < latestDate) {
          throw new AppError(409, "Effective date must be after the latest salary record", "EFFECTIVE_DATE_NOT_AFTER_LATEST");
        }
      }
      if (computeTotals(input.components).netCents < 0) {
        throw new AppError(400, "Deductions cannot exceed total earnings", "NEGATIVE_NET");
      }

      // Phase 4 (Audit): record the salary change here, inside the same transaction.
      const record = await tx.salaryRecord.create({
        data: {
          employeeId,
          currency: input.currency,
          effectiveDate: new Date(`${input.effectiveDate}T00:00:00.000Z`),
          reason: input.reason ?? "Initial salary",
          createdById: userId,
          components: { create: input.components },
        },
      });
      return record.id;
    })
    .catch((error: unknown) => {
      if (prismaCode(error) === "P2002") {
        throw new AppError(409, "A salary record already exists for this date", "DUPLICATE_EFFECTIVE_DATE");
      }
      throw error;
    });

  return getSalary(employeeId, id);
}
```

- [ ] **Step 4: Implement `salary.controller.ts`:**

```ts
import type { Request, Response } from "express";

import { createSalarySchema, employeeIdParamSchema, salaryParamsSchema } from "./salary.schema.ts";
import { createSalary, getSalaries, getSalary } from "./salary.service.ts";

export async function listSalariesHandler(request: Request, response: Response) {
  const { id } = employeeIdParamSchema.parse(request.params);
  response.status(200).json(await getSalaries(id));
}

export async function createSalaryHandler(request: Request, response: Response) {
  const { id } = employeeIdParamSchema.parse(request.params);
  const input = createSalarySchema.parse(request.body);
  const salary = await createSalary(id, request.user!.id, input);
  response.status(201).json({ salary });
}

export async function getSalaryHandler(request: Request, response: Response) {
  const { id, salaryId } = salaryParamsSchema.parse(request.params);
  response.status(200).json({ salary: await getSalary(id, salaryId) });
}
```

- [ ] **Step 5: Implement `salary.routes.ts` and mount.**

```ts
import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.ts";
import { createSalaryHandler, getSalaryHandler, listSalariesHandler } from "./salary.controller.ts";

export const salaryRouter = Router({ mergeParams: true });

salaryRouter.use(requireAuth, requireRole("ADMIN", "HR_MANAGER"));

salaryRouter.get("/", listSalariesHandler);
salaryRouter.post("/", createSalaryHandler);
salaryRouter.get("/:salaryId", getSalaryHandler);
```

In `app.ts` add `import { salaryRouter } from "./modules/salaries/salary.routes.ts";` and, **before** the `/api/employees` line, `app.use("/api/employees/:id/salaries", salaryRouter);` (it must be mounted before `employeeRouter`, whose `requireAuth` would otherwise also run; order only matters for clarity, but keep it first).

- [ ] **Step 6: Run the salary route tests, fix, then the full suite.**

Run: `cd backend && bunx vitest run src/modules/salaries && bun run typecheck && bun run test`
Expected: all PASS. If the concurrency test is flaky, confirm the `FOR UPDATE` query ran (not the fallback P2002 path) before changing anything.

- [ ] **Step 7: Commit.**

```bash
git add backend/src
git commit -m "feat(backend): add salary API (create, revise, history) with locking transaction"
```

---

### Task 4: Frontend data layer (api, form schema, currencies)

**Files:**
- Modify: `frontend/app/lib/employees-api.ts` (export `call` as `apiCall`)
- Create: `frontend/app/lib/currencies.ts`, `frontend/app/lib/salaries-api.ts`, `frontend/app/lib/salary-form.ts`
- Test: `frontend/app/lib/salaries-api.test.ts`, `frontend/app/lib/salary-form.test.ts`

**Interfaces:**
- Produces:
  - `currencies.ts`: `CURRENCIES: { code: string; name: string }[]` (the 20 codes in Global Constraints with English names), `formatMoney(amount: string, currency: string): string` using `Intl.NumberFormat("en", { style: "currency", currency })` (amount parsed with `Number`, display only).
  - `salaries-api.ts`: types `SalaryComponentType`, `SalaryComponent`, `Salary` (shape = backend `SalaryDto`), `SalaryOverview = { current: Salary | null; scheduled: Salary | null; history: Salary[] }`, `SalaryPayload`; functions `getSalaries(request, employeeId): Promise<ApiResult<SalaryOverview>>`, `createSalary(request, employeeId, payload): Promise<ApiResult<{ salary: Salary }>>`, `toSalaryFormError(result): { message: string; field?: "effectiveDate" | "reason" | "baseAmount" }`.
  - `salary-form.ts`: `makeSalaryFormSchema(mode: "initial" | "revise")`, `type SalaryFormValues = { currency; effectiveDate; reason; baseAmount; extras: { type: "ALLOWANCE"|"BONUS"|"DEDUCTION"; name; amount }[] }`, `computeFormTotals(values): { gross: string; deductions: string; net: string } | null` (null when any amount is invalid), `toPayload(values): SalaryPayload` (BASE row named `"Base salary"`, empty reason omitted), `valuesFromSalary(salary): SalaryFormValues` (prefill for revision, effectiveDate empty, reason empty).

- [ ] **Step 1: Export the helper.** In `employees-api.ts` change `async function call<T>` to `export async function apiCall<T>` and update its internal uses (`call(` -> `apiCall(`). Run the existing `employees-api.test.ts` to confirm nothing broke.

- [ ] **Step 2: Write failing tests.**
  - `salary-form.test.ts`: totals (`computeFormTotals` for base `1000`, extras allowance `200.10`, bonus `99.90`, deduction `300` -> gross `1300.00`, deductions `300.00`, net `1000.00`; returns `null` for base `"abc"`); schema (initial mode accepts empty reason, revise mode rejects reason `"ab"` and empty reason; rejects base `"0"`, `"1e3"`, `"5.555"`; rejects duplicate extra (type,name) case-insensitively; rejects net < 0 with the issue on `baseAmount`; requires currency and effectiveDate; extra with empty name rejected); `toPayload` produces BASE first and omits an empty reason; `valuesFromSalary` maps components (BASE -> `baseAmount`, rest -> `extras`) and blanks date/reason.
  - `salaries-api.test.ts`: stub `fetch`; `getSalaries` calls `/api/employees/e1/salaries` with the cookie forwarded and returns `{ ok: true }`; a 401 throws a redirect to `/login` (assert thrown `Response` status 302, `location` `/login`); a 403 returns `{ ok: false, status: 403 }`; `createSalary` POSTs the JSON body; `toSalaryFormError` maps `DUPLICATE_EFFECTIVE_DATE` and `EFFECTIVE_DATE_NOT_AFTER_LATEST` and `EFFECTIVE_DATE_BEFORE_JOINING` -> `effectiveDate`, `REASON_REQUIRED` -> `reason`, `NEGATIVE_NET` -> `baseAmount`, unknown code -> no field.

- [ ] **Step 3: Run, expect failure.** `cd frontend && bunx vitest run app/lib` -> new tests FAIL.

- [ ] **Step 4: Implement.** Key pieces of `salary-form.ts` (the rest follows the interfaces above):

```ts
import { z } from "zod";

import type { Salary, SalaryPayload } from "~/lib/salaries-api";

const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;
export const EXTRA_TYPES = ["ALLOWANCE", "BONUS", "DEDUCTION"] as const;

const cents = (amount: string) => {
  const [whole = "0", fraction = ""] = amount.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
};
const format = (value: number) => `${Math.floor(Math.abs(value) / 100)}.${String(Math.abs(value) % 100).padStart(2, "0")}`;

export function computeFormTotals(values: Pick<SalaryFormValues, "baseAmount" | "extras">) {
  const amounts = [values.baseAmount.trim(), ...values.extras.map((e) => e.amount.trim())];
  if (!amounts.every((a) => AMOUNT.test(a))) return null;
  let earnings = cents(amounts[0]!);
  let deductions = 0;
  values.extras.forEach((extra, i) => {
    const value = cents(amounts[i + 1]!);
    if (extra.type === "DEDUCTION") deductions += value;
    else earnings += value;
  });
  const net = earnings - deductions;
  return { gross: format(earnings), deductions: format(deductions), net: `${net < 0 ? "-" : ""}${format(net)}` };
}
```

`makeSalaryFormSchema(mode)` builds a `z.object({ currency, effectiveDate, reason, baseAmount, extras })`: `reason` is `z.string().trim().max(500)` plus, in revise mode, `.min(3, "Reason is required (at least 3 characters)")`, and in initial mode a refine allowing empty or >= 3 chars; `baseAmount` is `z.string().trim().regex(AMOUNT, "Enter an amount like 5000 or 5000.50")`; each extra has `name` `trim().min(1,"Name is required").max(100)` and `amount` same regex. A `superRefine` adds: base `> 0` (only if the regex passed) on path `["baseAmount"]`; duplicate (type, lowercased name) on path `["extras", index, "name"]` message "Duplicate component"; net `< 0` on path `["baseAmount"]` message "Deductions cannot exceed total earnings" (only when `computeFormTotals` is non-null). `toPayload` returns `{ currency, effectiveDate, ...(reason.trim() && { reason: reason.trim() }), components: [{ type: "BASE", name: "Base salary", amount: baseAmount.trim() }, ...extras.map(trim fields)] }`.

- [ ] **Step 5: Run lib tests, typecheck.** `cd frontend && bunx vitest run app/lib && bun run typecheck` -> PASS.

- [ ] **Step 6: Commit.**

```bash
git add frontend/app/lib
git commit -m "feat(frontend): add salary api client, form schema and currency helpers"
```

---

### Task 5: Compensation section and salary form dialog

**Files:**
- Create: `frontend/app/components/salary/CompensationSection.tsx`, `frontend/app/components/salary/SalaryFormDialog.tsx`
- Test: `frontend/app/components/salary/CompensationSection.test.tsx`, `frontend/app/components/salary/SalaryFormDialog.test.tsx`

**Interfaces:**
- Consumes: `Salary`, `SalaryOverview`, `ApiResult` (from `employees-api`), `formatMoney`, `CURRENCIES`, `makeSalaryFormSchema`, `computeFormTotals`, `valuesFromSalary`, `SalaryFormValues`, `ConfirmDialog`.
- Produces:
  - `CompensationSection` props: `{ result: ApiResult<SalaryOverview>; employeeActive: boolean; onSetSalary: () => void; onReviseSalary: () => void }`. Behaviour: `result.ok === false` with status 403 renders nothing; other failures render an `Alert severity="error"` "Could not load compensation."; empty history renders "No salary recorded yet." plus a "Set salary" button (only if `employeeActive`; otherwise a note "Inactive employees cannot receive salary changes."); populated renders heading "Compensation", the current card (currency, effective date, reason, components table grouped by type, Gross / Deductions / Net rows, "Revise salary" button when active), a `Scheduled` info `Alert` when `scheduled` exists ("Scheduled change effective {date}: net {net}"), and a "Salary history" table (columns Effective date, Status chip, Gross, Net, Change, Reason, Changed by) newest first; Change cell shows `+/-amount (percent%)` or "—" when `null`. When `current` is null but `history` has scheduled records, show "No current salary yet. Scheduled changes are listed below."
  - `SalaryFormDialog` props: `{ open: boolean; mode: "initial" | "revise"; current: Salary | null; minDate: string; submitting: boolean; serverError?: { message: string; field?: "effectiveDate" | "reason" | "baseAmount" } | null; onClose: () => void; onSubmit: (values: SalaryFormValues) => void }`. Title "Set salary" / "Revise salary". Fields: currency (select, defaults to `current.currency` or `"USD"`), effective date (`type="date"`, `inputProps.min = minDate`), reason (multiline), base salary, repeatable extras (type select, name, amount, "Remove" button, "Add component" button), live totals box (`Gross`, `Deductions`, `Net` via `formatMoney`, or "—" when `computeFormTotals` is null). In revise mode, form is prefilled from `valuesFromSalary(current)`; submitting opens a `ConfirmDialog` ("Save salary revision?", message with the new net and effective date, confirm label "Save revision") and only the confirm calls `onSubmit`. Initial mode calls `onSubmit` directly. `serverError.field` is set on the matching RHF field, otherwise rendered as an `Alert` inside the dialog. Buttons disabled while `submitting`.

- [ ] **Step 1: Write failing component tests.** `CompensationSection.test.tsx`: renders each state from a fixture (`ok` empty; `ok` with current + scheduled + two history rows; 403; 500; inactive employee empty and populated); asserts button presence/absence, `onSetSalary` / `onReviseSalary` calls, money formatted with the record currency (e.g. `₹`/`$` via `formatMoney`), Change cell content for a positive, negative and `null` change, history order. `SalaryFormDialog.test.tsx` (use `userEvent`): initial mode validates required fields (shows "Select a currency"/date message when empty) and submits payload values to `onSubmit`; live totals update when typing base and adding an extra deduction; "Remove" deletes a row; revise mode prefills base and extras, requires a reason, opens confirm dialog, `onSubmit` only after confirming and not after cancelling; `serverError` with `field: "effectiveDate"` shows its message under the date field; a field-less error shows an alert; `minDate` is applied to the date input; `submitting` disables the buttons.

- [ ] **Step 2: Run, expect failure.** `cd frontend && bunx vitest run app/components/salary` -> FAIL (modules missing).

- [ ] **Step 3: Implement both components.** Match `EmployeeForm.tsx` conventions: `Controller` + `TextField` with `inputRef={ref}`, `zodResolver(makeSalaryFormSchema(mode))` (memoise the schema with `useMemo` on `mode`), `useFieldArray({ control, name: "extras" })`, `useEffect` calling `setError` for `serverError.field`, and `reset(defaults)` in a `useEffect` when `open` becomes true so reopening starts clean. Use MUI `Dialog`/`DialogTitle`/`DialogContent`/`DialogActions`, `Table`, `Chip` (`CURRENT` success, `SCHEDULED` info, `PREVIOUS` default outlined), no icon package. Totals use `watch()` + `computeFormTotals`.

- [ ] **Step 4: Run, typecheck.** `cd frontend && bunx vitest run app/components/salary && bun run typecheck` -> PASS.

- [ ] **Step 5: Commit.**

```bash
git add frontend/app/components/salary
git commit -m "feat(frontend): add compensation section and salary form dialog"
```

---

### Task 6: Wire the profile route (loader, action, dialog, toast)

**Files:**
- Modify: `frontend/app/routes/employee-profile.tsx`
- Modify: `frontend/app/routes/employee-profile.test.tsx`

**Interfaces:**
- Consumes: `getSalaries`, `createSalary`, `toSalaryFormError` (Task 4); `CompensationSection`, `SalaryFormDialog` (Task 5); `payload` built by `toPayload`.
- Produces: loader returns `{ employee, salaries: ApiResult<SalaryOverview> }`. Action distinguishes by content type: `application/json` bodies are salary saves (`{ kind: "salary", ...values }` is NOT used; the body is a `SalaryFormValues` object), everything else is the existing status form post. Salary save result: `{ message: "Salary saved" }` or `{ error: string; field? }`.

- [ ] **Step 1: Update the existing test harness first.** `stubBackend(handler)` currently answers every URL with `{ employee }`. Change the tests so the handler branches on `url.pathname`: `/api/employees/e1/salaries` returns an overview fixture (`{ current: null, scheduled: null, history: [] }` by default), everything else returns `{ employee }`. Replace the assertion on "Compensation details will be available with the Salary module." with "No salary recorded yet." Run the file; it should still pass before adding behaviour.

- [ ] **Step 2: Add failing tests** to `employee-profile.test.tsx`:
  - populated overview renders the current net and history rows;
  - salary API 500 -> profile still renders and shows "Could not load compensation.";
  - salary API 403 -> profile renders, no Compensation heading;
  - salary API 401 -> redirects to `/login`;
  - "Set salary" opens the dialog; filling currency, date and base and submitting sends a `POST` to `/api/employees/e1/salaries` with the expected JSON (`components[0]` is BASE `"Base salary"`), closes the dialog on success and shows the "Salary saved" toast;
  - revision flow: "Revise salary" -> fill date and reason -> confirm dialog -> POST sent only after confirming; history reloads (second GET returns the new overview);
  - 409 `EFFECTIVE_DATE_NOT_AFTER_LATEST` keeps the dialog open and shows the server message under the date field;
  - inactive employee: no "Set salary"/"Revise salary" buttons, note shown;
  - the status deactivate flow still works (existing tests unchanged).

- [ ] **Step 3: Run, expect failure.** `cd frontend && bunx vitest run app/routes/employee-profile.test.tsx` -> new tests FAIL.

- [ ] **Step 4: Implement.**
  - Loader:

```ts
export async function loader({ request, params }: Route.LoaderArgs) {
  const [employee, salaries] = await Promise.all([getEmployee(request, params.id), getSalaries(request, params.id)]);
  if (!employee.ok) throw new Response(employee.message, { status: employee.status });
  return { employee: employee.data.employee, salaries };
}
```

  - Action: at the top, `if (request.headers.get("content-type")?.includes("application/json")) { const values = (await request.json()) as SalaryFormValues; const result = await createSalary(request, params.id, toPayload(values)); return result.ok ? { message: "Salary saved" } : { error: result.message, ...toSalaryFormError(result) }; }`, then the existing status code. Keep the return type a union that includes `{ error: string; field?: ... }`.
  - Component: state `dialog: "initial" | "revise" | null`; a **separate** `useFetcher` for salary saves (`salaryFetcher`) so status and salary results never mix; on `salaryFetcher.data` success -> toast "Salary saved" and `setDialog(null)`; on error keep the dialog open and pass `serverError`. Replace the placeholder `Card` with `<CompensationSection result={salaries} employeeActive={employee.status === "ACTIVE"} onSetSalary={() => setDialog("initial")} onReviseSalary={() => setDialog("revise")} />`. `minDate` = the later of `employee.joiningDate` and the day after `history[0].effectiveDate` (compute with a small pure helper `nextDay(date: string)` in `salary-form.ts` using UTC arithmetic; add a unit test in Task 4's test file if not already present). Submit with `salaryFetcher.submit(values, { method: "post", encType: "application/json" })`. Reset stale server error when the dialog opens (key the dialog on an open counter or clear on close).

- [ ] **Step 5: Full frontend checks.**

Run: `cd frontend && bun run typecheck && bun run test && bun run build`
Expected: all pass; build succeeds.

- [ ] **Step 6: Commit.**

```bash
git add frontend/app
git commit -m "feat(frontend): show compensation on the employee profile with set and revise flows"
```

---

### Task 7: Verification, docs and summary

**Files:**
- Create: `docs/implementation/2026-10-02-salary-management-summary.md`
- Modify: `docs/04-implementation-status.md`, `README.md`, `backend/README.md`, `frontend/README.md`, `docs/implementation/2026-10-02-employee-management-summary.md` (profile no longer has a compensation placeholder; keep history accurate by adding a one-line note), `docs/02-tech-stack-and-architecture.md` only if something diverges.

- [ ] **Step 1: Full checks.**

Run: `cd backend && bun run typecheck && bun run test`, then `cd frontend && bun run typecheck && bun run test && bun run build`
Expected: all green. Record the file/test counts.

- [ ] **Step 2: Manual API pass** against dev servers (`bun run dev` in each, DB seeded): log in with curl (cookie jar), then: GET salaries for a seeded employee; POST a revision; POST same date (409); POST earlier date (409); POST without reason (400); POST negative net (400); GET one record; GET with another employee's salary id (404); unauthenticated (401). Clean up any rows you created (delete the added `SalaryRecord` by id with prisma). Then drive the SSR profile page with curl through the frontend origin: unauthenticated redirect; page contains "Compensation" and the seeded net amount. State plainly in the summary that no real-browser click-through was done unless one was.

- [ ] **Step 3: Write docs.** Status table: Salary module row -> Done with a one-line description; note Audit still pending. Summary doc sections: Original task (the user's request, condensed), What was completed, Data model, API, Validation rules, Decisions (the 14 from the spec plus the equal-date ruling), Tests and checks (actual numbers), Known limitations (spec section 9, plus anything found), Known follow-ups (e.g. FE/BE currency lists duplicated, FE/BE totals logic duplicated, no per-field 400 details, `apiFetch` header spread, "today" UTC vs local, no pay-period, no back-fill, Audit hook marker in `createSalary`), Next session (Dashboard/Analytics or Audit; Import needs salary CSV rules). READMEs: add the three endpoints and the seed note.

- [ ] **Step 4: Commit.**

```bash
git add docs README.md backend/README.md frontend/README.md
git commit -m "docs: document salary management module and update status"
```
