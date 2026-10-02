# Salary Management Module: Implementation Summary

Date: 2026-10-02. Branch: `feature/salary-management`. Spec: `docs/superpowers/specs/2026-10-02-salary-management-design.md`. Plan: `docs/superpowers/plans/2026-10-02-salary-management.md`.

## Original task

Build the Salary Management module on top of Employee Management: record an employee's compensation, revise it over time without overwriting earlier records, and review the full history (UC-SAL-01..05), with a compensation section on the employee profile, tests and docs.

## What was completed

- Prisma: `SalaryRecord`, `SalaryComponent`, `SalaryComponentType` plus migration `add_salary_records` (with raw-SQL DB guards). `db:seed` now also creates salary history for `EMP-0001` (INR, 2 records), `EMP-0002` (USD, 2 records) and `EMP-0003` (GBP, 1 record); an employee that already has records is skipped.
- Backend: `modules/salaries` (`salary.routes`, `salary.controller`, `salary.service`, `salary.schema`, `salary.calc`); static ISO 4217 list in `lib/currencies.ts`; router mounted in `app.ts` at `/api/employees/:id/salaries`.
- Frontend: `lib/salaries-api.ts`, `lib/salary-form.ts` (zod schema, totals, `nextDay`), `lib/currencies.ts`; `components/salary/CompensationSection` (current card, scheduled banner, history table, empty/error/inactive states) and `SalaryFormDialog` (set and revise, live totals, confirm step for revisions); `routes/employee-profile.tsx` loader fetches salaries and the action handles the JSON salary save. The old compensation placeholder card on the profile is gone.
- Docs and READMEs updated.
- Note: this module had no standalone salaries page (the sidebar "Salaries" link had no route). The company-wide read-only list was added later as the salary directory: see [2026-10-03-salary-directory-summary.md](2026-10-03-salary-directory-summary.md).

## Data model

```prisma
enum SalaryComponentType { BASE ALLOWANCE BONUS DEDUCTION }

model SalaryRecord {
  id            String            @id @default(uuid())
  employeeId    String
  employee      Employee          @relation(fields: [employeeId], references: [id], onDelete: Restrict)
  currency      String            @db.Char(3)
  effectiveDate DateTime          @db.Date
  reason        String
  createdById   String
  createdBy     User              @relation(fields: [createdById], references: [id], onDelete: Restrict)
  createdAt     DateTime          @default(now())
  components    SalaryComponent[]

  @@unique([employeeId, effectiveDate])
  @@index([effectiveDate])
}

model SalaryComponent {
  id             String              @id @default(uuid())
  salaryRecordId String
  salaryRecord   SalaryRecord        @relation(fields: [salaryRecordId], references: [id], onDelete: Cascade)
  type           SalaryComponentType
  name           String
  amount         Decimal             @db.Decimal(14, 2)

  @@unique([salaryRecordId, type, name])
}
```

`Employee` and `User` gain a `salaryRecords` relation. The migration (`20261002150123_add_salary_records`) appends two guards in raw SQL: `CHECK ("amount" >= 0)` on `SalaryComponent` and a partial unique index `(salaryRecordId) WHERE type = 'BASE'`. A `migrate dev --create-only` drift check produced an empty migration, so Prisma does not try to drop the partial index.

## API

All routes require a session with role `ADMIN` or `HR_MANAGER` (401 unauthenticated, 403 otherwise). There is no PATCH or DELETE: records are append-only.

| Method and path | Purpose | Notes |
|---|---|---|
| `GET /api/employees/:id/salaries` | Overview | `{ current, scheduled, history }`; `history` is every record, newest first. 404 `EMPLOYEE_NOT_FOUND` |
| `POST /api/employees/:id/salaries` | Create initial record or revision | 201 `{ salary }` |
| `GET /api/employees/:id/salaries/:salaryId` | One record | `{ salary }`; 404 `SALARY_NOT_FOUND` also when the record belongs to another employee |

Salary object: `{ id, employeeId, currency, effectiveDate, reason, createdAt, createdBy: {id, name}, components: [{id, type, name, amount}], totals: {gross, deductions, net}, changeFromPrevious: {gross, net, grossPercent} | null, status: "CURRENT" | "SCHEDULED" | "PREVIOUS" }`. Amounts are decimal strings; components are sorted BASE, ALLOWANCE, BONUS, DEDUCTION then by name. `changeFromPrevious` is `null` for the first record and when the currency differs from the previous record.

`current` is the record with the latest `effectiveDate` on or before today (UTC); `scheduled` is the nearest upcoming future-dated record (the next change); later future records are still in `history` as `SCHEDULED`. Both are `null` when absent.

Errors:

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body or path id fails validation |
| 400 | `REASON_REQUIRED` | Revision without a reason |
| 400 | `EFFECTIVE_DATE_BEFORE_JOINING` | Date before the employee's joining date |
| 400 | `NEGATIVE_NET` | Deductions exceed gross |
| 404 | `EMPLOYEE_NOT_FOUND`, `SALARY_NOT_FOUND` | |
| 409 | `EMPLOYEE_INACTIVE` | Inactive employee (history stays viewable) |
| 409 | `DUPLICATE_EFFECTIVE_DATE` | Same date as the newest record, or a concurrent insert hit the unique constraint (P2002) |
| 409 | `EFFECTIVE_DATE_NOT_AFTER_LATEST` | Date earlier than the newest record |

## Validation rules

- `currency`: trimmed, uppercased, one of the supported ISO 4217 codes. `effectiveDate`: `YYYY-MM-DD`, a real calendar date.
- `reason`: trimmed, 3-500 chars; required for a revision, optional for the first record (defaults to "Initial salary").
- `components`: 1-30 items `{ type, name, amount }`; `name` trimmed 1-100 chars; `amount` a decimal string `^\d{1,12}(\.\d{1,2})?$`; exactly one `BASE`, with amount greater than 0; no duplicate (type, name), case-insensitive. Strict object: unknown keys rejected.
- Zero-decimal currencies: for `JPY` and `KRW` a non-zero fractional part is rejected (`5000`, `5000.0`, `5000.00` pass; `5000.50` fails) in the backend schema (issue on `components`) and the frontend form schema (issue on `baseAmount` or `extras.i.amount`), so displayed amounts equal stored ones.
- Service rules, checked in this order inside the transaction: employee exists, employee active, reason present for a revision, date not before joining date, date strictly after the newest record (equal -> `DUPLICATE_EFFECTIVE_DATE`, earlier -> `EFFECTIVE_DATE_NOT_AFTER_LATEST`), net not negative.
- IDs in paths must be UUIDs (else 400).

## Decisions

The fourteen from the spec: (1) `SalaryRecord` plus child `SalaryComponent`, append-only; (2) component type enum with exactly one `BASE` per record; (3) totals computed in integer cents by one backend helper, never stored, net must not be negative; (4) all amounts per period, no pay-period concept; (5) per-record ISO 4217 currency, no conversion; (6) back-dated or future-dated `effectiveDate`, not before joining, unique per employee; (7) "current" derived at read time (UTC), no job; (8) new date must be after the newest record; (9) one endpoint for initial record and revision, revision needs a reason; (10) inactive employees keep history but get 409 on new records; (11) own `requireRole("ADMIN","HR_MANAGER")` on the salary router, frontend hides the section on 403; (12) no audit table, the record is the trail, one marked hook in `createSalary` for Phase 4; (13) create runs in one transaction that locks the employee row (`SELECT ... FOR UPDATE`) with the unique constraint as backstop; (14) no new dependencies.

Rulings made during implementation:
- An effective date equal to the newest record returns 409 `DUPLICATE_EFFECTIVE_DATE`; an earlier one returns 409 `EFFECTIVE_DATE_NOT_AFTER_LATEST` (the spec had the latter for both).
- `scheduled` is the nearest upcoming future-dated record, not the furthest (spec wording corrected).
- The profile salary call never blocks the profile: a failure shows an error state in the section, 403 hides it, 401 redirects to login.
- The profile action distinguishes the salary save by JSON content type; the dialog state (mode, current record, minimum date) is captured when it opens, and the minimum date is the later of the joining date and the day after the newest record.
- The form is `noValidate` inside the dialog so the date `min` attribute does not trigger native validation; revisions go through the existing `ConfirmDialog`.

## Tests and checks (final run)

- Backend: `bun run typecheck` clean; `bun run test` 15 files, 161 tests passing (salaries module: calc, schema and routes, including the row-lock test and a concurrent-create test).
- Frontend: `bun run typecheck` clean; `bun run test` 24 files, 157 tests passing; `bun run build` succeeds.
- Manual API pass (curl, dev servers on 3001 and 3000, seeded DB, cookie jar, login as the seeded admin): list for `EMP-0002` (current 87,000.00 USD from 2022-07-01, no scheduled, previous 70,000.00 with null change); POST revision dated 2024-01-01 (201, gross 91000.50, change +4000.50 / 4.60%); same date (409 `DUPLICATE_EFFECTIVE_DATE`); earlier date (409 `EFFECTIVE_DATE_NOT_AFTER_LATEST`); no reason (400 `REASON_REQUIRED`); negative net (400 `NEGATIVE_NET`); GET one record (200); another employee's salary id (404 `SALARY_NOT_FOUND`); unauthenticated (401). The created record was deleted afterwards with Prisma and the seeded data confirmed unchanged (5 records, 12 components, `EMP-0001`..`EMP-0003`).
- SSR pass with curl through the frontend origin: unauthenticated `/employees/:id` returns 302 to `/login`; authenticated page returns 200 and contains "Compensation", "Salary history", the seeded net 87,000.00 and the previous 70,000.00 and "Promotion". **No real-browser click-through was performed**, so the dialog, confirmation step, toast display, focus behaviour and layout are covered only by component tests.

## Known limitations

- No separate audit table until Phase 4; the record itself (`createdBy`, `createdAt`, `reason`) is the trail.
- No pay-period concept; amounts are per period as entered.
- No back-filling or correcting past records; a wrong entry is fixed by a new later revision.
- No currency conversion; the change from the previous record is not shown across currencies.
- "Today" is evaluated in UTC on the server and in local time in the browser.
- ADMIN and HR_MANAGER permissions are identical.
- Manual verification was API plus SSR via curl only (see above).

## Known follow-ups (deferred review minors)

- Seed creates each employee's records one by one, not in a transaction, and `prisma/seed.ts` is not covered by the tsconfig typecheck.
- The migration's raw-SQL guards have no comment header.
- Salary tests: the lock test lacks a `try/finally` release, the concurrency test asserts statuses only, and there is no test with two future-dated records (nearest `scheduled`).
- Frontend `effectiveDate` regex accepts impossible dates (server rejects them).
- The dialog reset effect depends on the `current` reference (the route passes a captured copy).
- No direct unit test for the JSON branch of the profile action.
- Frontend and backend currency lists are duplicated; frontend and backend totals logic are duplicated.
- 400 responses carry no per-field details, so only 409 codes map to form fields.
- `apiFetch` header spread drops `Headers` instances (fix before CSV import).
- "Today" is UTC on the server vs local in the browser.
- Audit hook marker in `createSalary` is a comment only.

## Next session

Dashboard and Analytics (Phase 2, uses the salary tables; the pay-period question from decision 4 must be settled for annualised metrics) or the Audit module (Phase 4, replace the marker in `createSalary` and employee changes). CSV Import (Phase 3) needs its own salary CSV rules: components layout, currency, effective date, and how rows map to the append-only, strictly-increasing-date constraint. Also pick up the carried-over minors from the foundation and employee summaries. Per `CLAUDE.md`: explain the plan and get approval before starting; work on a feature branch, never commit to `main`.
