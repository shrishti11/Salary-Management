# Salary Management Design

Date: 2026-10-02
Status: Draft, awaiting review

## 1. Purpose

Let HR managers record an employee's compensation, revise it over time, and review the full history (UC-SAL-01..05 in `docs/03-modules-and-use-cases.md`). Revisions never overwrite earlier records. The module is the base for Dashboard, Analytics and CSV import.

Out of scope: payroll, tax, currency conversion, approval workflows, pay-period/annualisation, Dashboard, Analytics, CSV import/export, the Audit module and its table, editing or deleting salary records, back-filling the middle of history.

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | `SalaryRecord` (employeeId, currency, effectiveDate, reason, createdById, createdAt) plus child `SalaryComponent` (salaryRecordId, type, name, amount). Records are append-only: no update or delete route. | Preserves history by construction. |
| 2 | Component `type` is enum `BASE`, `ALLOWANCE`, `BONUS`, `DEDUCTION`. Exactly one `BASE` per record; any number of the others, each with a name (1-100 chars, unique per type within a record). | UC-SAL-05 lists these four. |
| 3 | Totals are not stored. Gross = base + allowances + bonuses. Net = gross - deductions. One backend helper computes them in integer minor units (cents), and the API returns them as decimal strings. Net must not be negative. | One consistent calculation; no stored value that can drift. |
| 4 | All components are per-period amounts. There is no pay-period or annualisation concept. | Docs define none; deferred as an open question for Analytics. |
| 5 | `currency` is an ISO 4217 code from a static list (about 20) on the record. It may change between revisions. No conversion. | Matches docs ("multiple currencies", no conversion in v1). |
| 6 | `effectiveDate` is `YYYY-MM-DD`, a real calendar date, may be back-dated or future-dated, and not before the employee's `joiningDate`. Unique on (employeeId, effectiveDate). | Back-dating is needed for history; scheduled raises are common. |
| 7 | "Current" = the record with the latest `effectiveDate` on or before today (UTC, server). A later-dated record is "scheduled". Derived at read time; no job. | Simple, no moving parts. |
| 8 | A new record's `effectiveDate` must be strictly after the newest existing record's date. Otherwise 409: `DUPLICATE_EFFECTIVE_DATE` if equal to it, `EFFECTIVE_DATE_NOT_AFTER_LATEST` if earlier. | Avoids recompute rules for mid-history inserts. |
| 9 | One endpoint creates the initial record or a revision; the service decides. A revision requires a reason (3-500 chars). The initial record's reason is optional and defaults to "Initial salary". | Matches `POST /api/employees/:id/salaries` in the architecture doc. |
| 10 | Inactive employees: history stays viewable; new records return 409 `EMPLOYEE_INACTIVE`. | Employee doc excludes inactive staff from metrics. |
| 11 | Salary router uses `requireAuth` + its own `requireRole("ADMIN","HR_MANAGER")`. Frontend shows the section only if the API call succeeds. | Easy to tighten independently of Employees. |
| 12 | No `AuditLog` table now. Each record stores `createdById`, `createdAt` and `reason`, so history is its own trail. The create service has one marked hook for Phase 4. | Audit is Phase 4; avoids a speculative table. |
| 13 | Create runs in one transaction that locks the employee row (`SELECT ... FOR UPDATE`), re-reads the latest record, validates, then inserts record and components together. The unique constraint is the backstop (P2002 -> 409 `DUPLICATE_EFFECTIVE_DATE`). | Concurrent revisions yield one 201 and one 409, never two silent rows. |
| 14 | No new dependencies. | MUI, RHF and zod suffice. |

## 3. Data model

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

`Employee` gains `salaryRecords SalaryRecord[]`, `User` gains `salaryRecords SalaryRecord[]`. Migration `add_salary_records`. DB-level guards: a check constraint `amount >= 0`; a partial unique index `(salaryRecordId) WHERE type = 'BASE'` so a record can never hold two bases (added in raw SQL in the migration). Seed adds salary history for the sample employees (idempotent: skip an employee that already has records).

The `onDelete: Cascade` on components is safe because records themselves are never deleted through the API.

## 4. Validation (zod, `salary.schema.ts`)

- `currency`: one of the supported ISO 4217 codes (uppercased, trimmed).
- `effectiveDate`: `YYYY-MM-DD`, real date.
- `reason`: trimmed, 3-500 chars; optional only for the first record.
- `components`: array, 1-30 items. Each `{ type, name, amount }`: `name` trimmed 1-100 chars; `amount` a decimal string `^\d{1,12}(\.\d{1,2})?$`, `>= 0`, and `> 0` for `BASE`. Exactly one `BASE`. No duplicate (type, name) pairs (case-insensitive).
- Service rules (not schema): net >= 0; date not before joining date; date after latest record; employee active; employee exists.
- Strict object: unknown keys are rejected. IDs in paths must be UUIDs (else 400).

## 5. API

All routes under `requireAuth` + `requireRole`. Errors use `{ error: { message, code? } }`.

| Method | Path | Result |
|---|---|---|
| GET | `/api/employees/:id/salaries` | `{ current, scheduled, history }` |
| POST | `/api/employees/:id/salaries` | 201 `{ salary }` |
| GET | `/api/employees/:id/salaries/:salaryId` | `{ salary }` |

A salary object: `{ id, employeeId, currency, effectiveDate, reason, createdAt, createdBy: {id, name}, components: [{id,type,name,amount}], totals: {gross, deductions, net}, changeFromPrevious: { gross, net, grossPercent } | null, status: "CURRENT"|"SCHEDULED"|"PREVIOUS" }`.

`changeFromPrevious` is `null` for the first record, and also `null` when the currency differs from the previous record (a cross-currency delta is meaningless without conversion). `history` includes every record, newest first, with the current one flagged. `current` and `scheduled` are `null` when absent; `scheduled` is the nearest upcoming future-dated record, i.e. the next change (further future records are still in `history` as SCHEDULED).

Errors: 400 validation / bad uuid; 401; 403; 404 `EMPLOYEE_NOT_FOUND` / `SALARY_NOT_FOUND` (record belongs to another employee); 409 `EMPLOYEE_INACTIVE`, `EFFECTIVE_DATE_NOT_AFTER_LATEST`, `DUPLICATE_EFFECTIVE_DATE`; 422 is not used (400 for business-rule value errors like negative net, effective date before joining: codes `NEGATIVE_NET`, `EFFECTIVE_DATE_BEFORE_JOINING`).

Layout mirrors `modules/employees`: `modules/salaries/{salary.routes,salary.controller,salary.service,salary.schema,salary.calc}.ts`. `salary.calc.ts` is a pure module (totals, change). Mounted in `app.ts` under `/api/employees/:id/salaries` with `mergeParams`. A static `lib/currencies.ts` holds the supported list.

## 6. Frontend

- `employee-profile.tsx` loader also fetches salaries (failure of the salary call does not block the profile; the section shows its own error state, and a 403 hides the section).
- `components/salary/CompensationSection`: current salary card (currency, effective date, reason, component breakdown, gross/deductions/net), a "Scheduled" banner, a history table (date, status chip, currency, gross, net, change, reason, changed by), empty state with "Set salary" button.
- `components/salary/SalaryForm` (dialog): component rows (type select, name, amount, add/remove), one BASE row fixed, live gross/net preview computed with the same rules, effective date, reason, currency. A revision prefills from the current record. Submit opens a `ConfirmDialog` summarising the change for revisions.
- Submission goes through a route action using `apiFetchAs`; server errors (`EFFECTIVE_DATE_NOT_AFTER_LATEST`, `DUPLICATE_EFFECTIVE_DATE`, `NEGATIVE_NET`, `EMPLOYEE_INACTIVE`) map to inline messages. Success shows the existing toast.
- Inactive employees: buttons hidden, history still shown, short explanatory note.
- Helpers: `lib/salaries-api.ts`, `lib/salary-form.ts` (zod + gross/net calc), `lib/currencies.ts`. Money is displayed with `Intl.NumberFormat` using the record's currency; amounts stay strings in transit and state to avoid float errors.

## 7. Testing

Backend (Vitest + Supertest, local Postgres): `salary.calc` units (totals, rounding, change, cross-currency null); schema units (one BASE, duplicates, amount formats, bad currency); routes: create initial (201, default reason), revise (history keeps old row), revise without reason (400), same date (409), earlier date (409), date before joining (400), negative net (400), inactive employee (409), unknown employee (404), salary id of another employee (404), future-dated record shows as scheduled and not current, current switches by date, concurrent creates (one wins), 401 without cookie, 403 for a forged role, ADMIN login works, no PATCH/DELETE routes (404).

Frontend (Vitest + RTL): `CompensationSection` states (loading via loader, empty, populated, scheduled, error, hidden on 403, inactive); `SalaryForm` validation, live totals, revision prefill, server-error mapping; `salary-form` unit tests; `salaries-api` URL building; profile action; routes test.

Checks: backend and frontend `typecheck` and `test`, frontend `build`. No lint script exists (as before). Manual curl pass against dev servers; no real-browser click-through unless performed, and the summary will say which.

## 8. Documentation

Update `docs/04-implementation-status.md`, `docs/02-tech-stack-and-architecture.md` only if something diverges, READMEs, and add `docs/implementation/2026-10-02-salary-management-summary.md` (task, work done, model, endpoints, validation, decisions, tests, limitations, next steps). Remove the "compensation placeholder" limitation from the Employee summary.

## 9. Known limitations (accepted)

- No separate audit table until Phase 4; the record itself is the trail.
- No pay-period concept; amounts are per period as entered.
- No back-filling or correcting past records; a wrong entry is fixed by a new later revision.
- No currency conversion; cross-currency change is not shown.
- "Today" is evaluated in UTC on the server.
- ADMIN and HR_MANAGER permissions are identical.
