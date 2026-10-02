# Employee Management Design

Date: 2026-10-02
Status: Draft, awaiting review

## 1. Purpose

Let HR managers add, find, view, edit and activate/deactivate employees (UC-EMP-01..06 in `docs/03-modules-and-use-cases.md`). The module is the base for Salary, Dashboard and Import.

Out of scope: salary data (profile shows a placeholder only), audit log, CSV import/export, hard delete, department CRUD UI, admin user management.

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | `Department` is its own table; `Employee.departmentId` FK | Dashboard groups by department; avoids typo-split groups. Read-only `GET /api/departments`, seeded; no CRUD UI. |
| 2 | `country` is ISO 3166 alpha-2 (`CHAR(2)`), UI shows names from a small static list | Clean grouping for analytics. |
| 3 | `employeeCode` unique, trimmed + uppercased, immutable after create | Key that Salary and Import will reference. |
| 4 | `email` unique, trimmed + lowercased, editable | Docs require unique emails. |
| 5 | Status changes via `PATCH /api/employees/:id/status`; no DELETE route; update schema omits `status` and `employeeCode` | Preserves history; keeps status change an explicit action. |
| 6 | Both roles (`ADMIN`, `HR_MANAGER`) may read and write; routes use `requireAuth` + explicit `requireRole("ADMIN","HR_MANAGER")` | Easy to tighten for Salary later. |
| 7 | Uniqueness enforced by DB constraints; Prisma `P2002` mapped to 409 | No check-then-insert race. |
| 8 | Inactive employees stay in the list (Inactive chip, Status filter, default "All"), remain viewable and editable | "Consistent handling"; `status` is what Dashboard/Analytics will filter on. Cross-module rules belong to those modules. |
| 9 | No new dependencies | MUI Table/Dialog/Snackbar suffice; no data-grid. |

## 3. Data model

```prisma
enum EmployeeStatus { ACTIVE INACTIVE }

model Department {
  id        String     @id @default(uuid())
  name      String     @unique
  employees Employee[]
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
}

model Employee {
  id           String         @id @default(uuid())
  employeeCode String         @unique
  firstName    String
  lastName     String
  email        String         @unique
  phone        String?
  departmentId String
  department   Department     @relation(fields: [departmentId], references: [id], onDelete: Restrict)
  designation  String
  country      String         @db.Char(2)
  joiningDate  DateTime       @db.Date
  status       EmployeeStatus @default(ACTIVE)
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt

  @@index([status])
  @@index([departmentId])
  @@index([country])
  @@index([lastName, firstName])
}
```

Migration `add_employee_department`. Seed adds ~6 departments and a few employees, idempotent (upsert by unique key).

## 4. Validation rules (zod, `employee.schema.ts`)

- `employeeCode`: 1-32 chars, `[A-Z0-9_-]`, trimmed, uppercased.
- `firstName`, `lastName`: 1-100 chars, trimmed.
- `email`: valid email, max 254, trimmed, lowercased.
- `phone`: optional; digits, spaces, `+ - ( )`, 7-20 chars; empty string becomes null.
- `departmentId`: uuid; must exist (else 400 `INVALID_DEPARTMENT`).
- `designation`: 1-100 chars, trimmed.
- `country`: two uppercase letters, must be in the supported list.
- `joiningDate`: `YYYY-MM-DD`, valid calendar date, not after today.
- `status` (status endpoint): `ACTIVE | INACTIVE`.
- Create: all required fields except `phone`; status defaults to ACTIVE. Update: same fields minus `employeeCode`/`status`; PATCH-style partial, at least one field.

## 5. API

All under `requireAuth` + `requireRole`. Errors use `{ error: { message, code? } }`.

| Method | Path | Result |
|---|---|---|
| GET | `/api/departments` | `{ departments: [{id,name}] }` sorted by name |
| GET | `/api/employees` | `{ data, pagination: {page,pageSize,total,totalPages} }` |
| POST | `/api/employees` | 201 `{ employee }` |
| GET | `/api/employees/:id` | `{ employee }` (includes `department`) |
| PATCH | `/api/employees/:id` | `{ employee }` |
| PATCH | `/api/employees/:id/status` | `{ employee }` |

List query: `page` (default 1), `pageSize` (default 20, max 100), `q` (case-insensitive contains on code, first name, last name, "first last", email), `departmentId`, `country`, `status`, `sortBy` (`employeeCode|name|department|designation|country|joiningDate|status`, default `employeeCode`), `sortOrder` (`asc|desc`). Sort adds `id` as a tie-breaker so paging is stable. Filters combine with `q` using AND. Unknown/invalid params return 400.

Errors: 400 validation / invalid uuid / `INVALID_DEPARTMENT`; 401; 403; 404 `EMPLOYEE_NOT_FOUND`; 409 `DUPLICATE_EMPLOYEE_CODE` or `DUPLICATE_EMAIL`.

Layout mirrors `modules/auth`: `employee.routes.ts`, `.controller.ts`, `.service.ts`, `.schema.ts`, plus `modules/departments/` (route, controller, service). Business logic and Prisma calls live in the service. Mounted in `app.ts`.

## 6. Frontend

Routes nested under `routes/authenticated.tsx`:

- `/employees`: list. State lives in URL search params; the loader reads them and calls the API with the forwarded cookie. Debounced search box, filters (department, country, status), sortable column headers, MUI `TablePagination`. States: loading (navigation pending), empty ("no employees" vs "no match" with a clear-filters action), error (route ErrorBoundary / inline alert). "Add employee" button in `PageHeader`.
- `/employees/new`: create form. Action posts to the API; on success redirects to the profile with a success flash; 409/400 field errors map back to form fields.
- `/employees/:id`: profile, structured details, Edit button, Activate/Deactivate button, back-to-list link, placeholder card for compensation. Deactivate opens a `ConfirmDialog`; reactivate does not. Snackbar for success/failure.
- `/employees/:id/edit`: same form prefilled; `employeeCode` shown read-only.

Shared pieces: `EmployeeForm` (React Hook Form + Zod, rules mirror the backend), `EmployeeTable`, `StatusChip`, `ConfirmDialog`, a static `countries.ts`. Loaders/actions go through `apiFetch` with the cookie forwarded (as in `require-user.ts`); a small `employees-api.ts` wraps the calls. Responsive: table scrolls horizontally on small screens; form fields stack.

## 7. Testing

Backend (Vitest + Supertest, local Postgres, unique codes/emails per test with cleanup): create valid/invalid, duplicate code, duplicate email (case-insensitive), invalid department; list search/filters/sort/pagination/stable ordering/invalid params; get 200/404/bad uuid; update (partial, email conflict, code immutable); status toggle both ways and history retained; 401 without cookie, 403 for a role outside the allowed set; departments list. Unit tests for schemas.

Frontend (Vitest + RTL): `EmployeeForm` validation and server-error mapping; table loading/empty/error states; list loader builds the right API query from URL params; deactivate confirm flow; actions handle 409 and 404; routes registered in `routes.test.ts`.

Checks: backend and frontend `typecheck` and `test`, frontend `build`. No lint script exists and none is added (CLAUDE.md: no new dependencies without reason). Final manual curl run against the dev servers.

## 8. Documentation

Update `docs/04-implementation-status.md`, `docs/02-tech-stack-and-architecture.md` (only if something diverges), backend/frontend READMEs, and add `docs/implementation/2026-10-02-employee-management-summary.md` (original task, work done, model, endpoints, validation, decisions, tests, limitations, next steps). Also fix the three stale lines in the foundation summary.

## 9. Known limitations (accepted)

- No audit trail of employee changes until Phase 4.
- `ILIKE` search uses B-tree-friendly indexes only for the sorted/filter columns; a trigram index is deferred until 10k-row performance is measured.
- Countries limited to a static list.
- Role split between ADMIN and HR_MANAGER is identical for now.
