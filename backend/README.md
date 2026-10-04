# Salary Management API

Express 5 + Prisma 7 + PostgreSQL, run with Bun/tsx.

## Run locally

```bash
cp .env.example .env     # set JWT_SECRET to 32+ random characters
bun install
bun run db:deploy        # prisma migrate deploy
bun run db:seed          # dev admin (admin@salary-management.local / ChangeMe123!) + sample departments/employees/salary history
bun run dev              # http://localhost:3001
```

## Scripts

| Script | Purpose |
|---|---|
| `dev` / `start` | Run the API (`tsx watch` / `tsx`) |
| `typecheck` / `test` | `tsc --noEmit` / Vitest (tests hit the local Postgres and need `.env`) |
| `prisma:generate` | Generate the client into `generated/prisma` (gitignored; generated in the Docker build) |
| `prisma:migrate` | `prisma migrate dev` (create/apply migrations in development) |
| `db:deploy` | `prisma migrate deploy` (used by the Docker CMD) |
| `db:seed:demo` | Load the 10,000-employee demo company (same code as the dashboard button; idempotent, about 8 s). Needs the dev admin from `db:seed` |
| `db:seed` | Upsert the dev admin user, 6 departments and 5 sample employees `EMP-0001`..`EMP-0005`, and create salary history for `EMP-0001`..`EMP-0003` (idempotent; an employee that already has salary records is skipped) |

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | required | Postgres connection string |
| `PORT` | `3001` | |
| `JWT_SECRET` | required | At least 32 characters |
| `JWT_EXPIRES_IN` | `1d` | JWT lifetime |
| `COOKIE_NAME` | `session` | Name of the httpOnly session cookie |
| `FRONTEND_URL` | `http://localhost:3000` | CORS allowed origin (credentials enabled) |

`src/config/env.ts` validates these with Zod and loads `.env` itself (guarded `process.loadEnvFile`) because tsx and vitest do not.

## API

- `GET /health` -> `{"status":"ok"}`
- `POST /api/auth/login` `{email, password}` -> sets the session cookie; 400 on invalid body, 401 on bad credentials
- `POST /api/auth/logout` -> clears the cookie
- `GET /api/auth/me` -> current user (requires cookie); 401 if missing/invalid/deactivated

Employees and departments require a session with role `ADMIN` or `HR_MANAGER` (401 without a session, 403 otherwise). Responses wrap the record as `{ "employee": ... }`.

- `GET /api/departments` -> `{ departments: [{id, name}] }` sorted by name
- `GET /api/employees` -> `{ data, pagination: {page, pageSize, total, totalPages} }`. Query: `page` (default 1), `pageSize` (1-100, default 20), `q` (whitespace-split tokens, each must match employee code, first/last name or email, case-insensitive), `departmentId`, `country` (ISO alpha-2), `status` (`ACTIVE`|`INACTIVE`; omitted = all), `sortBy` (`employeeCode`|`name`|`department`|`designation`|`country`|`joiningDate`|`status`, default `employeeCode`), `sortOrder` (`asc`|`desc`). Unknown params -> 400
- `POST /api/employees` -> 201 `{ employee }`; the Employee ID (`EMP-00001`, ...) is generated from the `employee_code_seq` database sequence and any client-supplied `employeeCode` is ignored; 400 `VALIDATION_ERROR` / `INVALID_DEPARTMENT`; 409 `DUPLICATE_EMAIL`
- `GET /api/employees/:id` -> `{ employee }`; 404 `EMPLOYEE_NOT_FOUND`
- `PATCH /api/employees/:id` partial update; `employeeCode` and `status` are rejected (400); 404/409 as above
- `PATCH /api/employees/:id/status` `{status}` -> `{ employee }`; there is no DELETE route

Salaries use the same roles and live under `/api/employees/:id/salaries`. Records are append-only (no PATCH or DELETE). Amounts are decimal strings; totals are computed server-side (gross = base + allowances + bonuses, net = gross - deductions).

- `GET /api/employees/:id/salaries` -> `{ current, scheduled, history }` (`history` newest first; each record has `components`, `totals`, `changeFromPrevious` and `status` `CURRENT`/`SCHEDULED`/`PREVIOUS`; `scheduled` is the nearest upcoming future-dated record). 404 `EMPLOYEE_NOT_FOUND`
- `POST /api/employees/:id/salaries` `{currency, effectiveDate, reason?, components: [{type, name, amount}]}` -> 201 `{ salary }`. Exactly one `BASE` component; `reason` (3-500 chars) is required for a revision; effective date must not precede the joining date and must be after the newest record. 400 `VALIDATION_ERROR` / `REASON_REQUIRED` / `EFFECTIVE_DATE_BEFORE_JOINING` / `NEGATIVE_NET`; 404 `EMPLOYEE_NOT_FOUND`; 409 `EMPLOYEE_INACTIVE` / `DUPLICATE_EFFECTIVE_DATE` (same date as the newest record) / `EFFECTIVE_DATE_NOT_AFTER_LATEST` (earlier date)
- `GET /api/employees/:id/salaries/:salaryId` -> `{ salary }`; 404 `SALARY_NOT_FOUND` (also for another employee's record)

### Salary directory

`GET /api/salaries` (ADMIN and HR_MANAGER) lists every employee with their current salary, for a company-wide read-only view.

- Query: `page` (default 1), `pageSize` (1-100, default 20), `q` (name, employee ID or email), `departmentId`, `country`, `status` (`ACTIVE` default, `INACTIVE`, `ALL`), `salary` (`with` / `without` a current salary), `sortBy` (`name` default, `employeeCode`, `department`, `country`, `joiningDate`, `effectiveDate`), `sortOrder` (`asc` default, `desc`). Unknown keys and invalid values return 400 `VALIDATION_ERROR`.
- Response: `{ data: [{ employee: { id, employeeCode, firstName, lastName, email, department, country, designation, joiningDate, status }, current: { id, currency, effectiveDate, gross, net, deductions, reason } | null, hasScheduled }], pagination: { page, pageSize, total, totalPages } }`. `joiningDate` and `effectiveDate` are `YYYY-MM-DD`. Amounts are decimal strings in the record's own currency; there is no amount sorting because currencies differ.

`GET /api/salaries/export` (same roles and query as the list; `page`/`pageSize` are ignored) returns the matching rows as a CSV download (UTF-8 BOM, spreadsheet-formula-safe cells, up to 50,000 rows).

### Demo data

- `GET /api/demo-data` (ADMIN, HR_MANAGER) -> `{ seeded, count, target }` (target 10,000; demo rows are the employees with an `@demo.acme.example` email).
- `POST /api/demo-data/seed` (ADMIN) -> 201 `{ created: true, count, target, durationMs }`, or 200 `{ created: false, ... }` when the target is already reached. One transaction guarded by a Postgres advisory lock, so double clicks cannot seed twice. It tops up to exactly 10,000 and never adds more.

- `POST /api/demo-data/reseed` (ADMIN) -> 201, same body: deletes the demo employees (only the `@demo.acme.example` domain) and their salary history, then seeds a fresh 10,000. CLI: `bun run db:seed:demo -- --reset`.

### Dashboard and analytics

All under ADMIN and HR_MANAGER (401 / 403 otherwise). Read-only Postgres aggregations; every monetary aggregate is per currency and currencies are never combined. Money values are decimal strings. A salary counts as current if it has the latest `effectiveDate <= asOf` (UTC); scheduled records and employees without a current salary are excluded from money metrics. Unknown query params and invalid values return 400 `VALIDATION_ERROR`.

| Endpoint | Query | Response |
|---|---|---|
| `GET /api/dashboard` | none | `{ asOf, metrics: { totalEmployees, activeEmployees, departmentCount, countryCount, withoutSalary, currencies }, departments, countries, recentEmployees (5), recentRevisions (5) }` (active employees, gross, as of today) |
| `GET /api/analytics/summary` | filters, `asOf` | `{ asOf, basis, headcount: { total, active, inactive, withSalary, withoutSalary }, currencies: [{ currency, count, total, average, median, min, max, p25, p75 }] }` |
| `GET /api/analytics/distribution` | filters, `asOf` | per currency, up to 10 equal-width buckets `{ from, to, count }` |
| `GET /api/analytics/groups` | filters, `asOf`, `groupBy` (`department` default, `country`, `designation`) | `{ groups: [{ key, label, headcount, withoutSalary, currencies }] }`; a currency with fewer than 3 salaried employees is `{ currency, count, suppressed: true }` |
| `GET /api/analytics/trends` | filters, `from`, `to` | per currency, zero-filled months `{ month, revisionCount, newSalaryCount, avgChangePercent, avgGross, avgNet }`; default last 12 months, `to` not in the future, max 60 months |
| `GET /api/analytics/filters` | none | `{ departments, countries, designations, currencies }` in use |

Filters: `departmentId`, `country`, `designation`, `status` (`ACTIVE` default, `INACTIVE`, `ALL`), `currency`, `basis` (`gross` default, `net`). Trends errors: 400 `INVALID_DATE_RANGE`. Summary `headcount.total/active/inactive` ignore `status`; `withSalary`/`withoutSalary` follow it; `currency` only trims the currency rows. Details: [`docs/implementation/2026-10-03-dashboard-analytics-summary.md`](../docs/implementation/2026-10-03-dashboard-analytics-summary.md).

Errors use `{ "error": { "message", "code?" } }`; `ZodError` maps to 400 `VALIDATION_ERROR`.

## Prisma 7 notes

- Config lives in `prisma7.config.ts` (datasource URL, migrations path); the schema has no `url`.
- The client uses the `@prisma/adapter-pg` driver adapter (`src/lib/prisma.ts`) and is generated to `generated/prisma` (import `../generated/prisma/client.ts`).
- Prisma 7 does not auto-load `.env`; the config and seed load it explicitly.
