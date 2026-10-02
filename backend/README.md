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
- `POST /api/employees` -> 201 `{ employee }`; 400 `VALIDATION_ERROR` / `INVALID_DEPARTMENT`; 409 `DUPLICATE_EMPLOYEE_CODE` / `DUPLICATE_EMAIL`
- `GET /api/employees/:id` -> `{ employee }`; 404 `EMPLOYEE_NOT_FOUND`
- `PATCH /api/employees/:id` partial update; `employeeCode` and `status` are rejected (400); 404/409 as above
- `PATCH /api/employees/:id/status` `{status}` -> `{ employee }`; there is no DELETE route

Salaries use the same roles and live under `/api/employees/:id/salaries`. Records are append-only (no PATCH or DELETE). Amounts are decimal strings; totals are computed server-side (gross = base + allowances + bonuses, net = gross - deductions).

- `GET /api/employees/:id/salaries` -> `{ current, scheduled, history }` (`history` newest first; each record has `components`, `totals`, `changeFromPrevious` and `status` `CURRENT`/`SCHEDULED`/`PREVIOUS`; `scheduled` is the nearest upcoming future-dated record). 404 `EMPLOYEE_NOT_FOUND`
- `POST /api/employees/:id/salaries` `{currency, effectiveDate, reason?, components: [{type, name, amount}]}` -> 201 `{ salary }`. Exactly one `BASE` component; `reason` (3-500 chars) is required for a revision; effective date must not precede the joining date and must be after the newest record. 400 `VALIDATION_ERROR` / `REASON_REQUIRED` / `EFFECTIVE_DATE_BEFORE_JOINING` / `NEGATIVE_NET`; 404 `EMPLOYEE_NOT_FOUND`; 409 `EMPLOYEE_INACTIVE` / `DUPLICATE_EFFECTIVE_DATE` (same date as the newest record) / `EFFECTIVE_DATE_NOT_AFTER_LATEST` (earlier date)
- `GET /api/employees/:id/salaries/:salaryId` -> `{ salary }`; 404 `SALARY_NOT_FOUND` (also for another employee's record)

Errors use `{ "error": { "message", "code?" } }`; `ZodError` maps to 400 `VALIDATION_ERROR`.

## Prisma 7 notes

- Config lives in `prisma7.config.ts` (datasource URL, migrations path); the schema has no `url`.
- The client uses the `@prisma/adapter-pg` driver adapter (`src/lib/prisma.ts`) and is generated to `generated/prisma` (import `../generated/prisma/client.ts`).
- Prisma 7 does not auto-load `.env`; the config and seed load it explicitly.
