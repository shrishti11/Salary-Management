# Salary Directory: Implementation Summary

Date: 2026-10-03. Branch: `feature/salary-directory`. Builds on the Salary Management and Employee Management modules.

## Original task

The sidebar "Salaries" link had no page. Add a read-only salary directory: one list of every employee with their current salary, searchable, filterable, sortable and paginated, with no changes to the append-only salary data model.

## What was completed

- Backend: `GET /api/salaries` in `modules/salaries` (`salary.directory.routes/controller/service`, query schema in `salary.schema.ts`), mounted in `app.ts`. Backend commit: `fa78efe`.
- Frontend: route `routes/salaries.tsx` (registered as `salaries` under the authenticated layout), `lib/salary-directory-api.ts` (types, `parseSalaryListParams`, `toSalarySearchParams`, `listSalaryDirectory`), `components/salary/SalaryDirectoryFilters.tsx` and `SalaryDirectoryTable.tsx`. The sidebar link already used a prefix match on the path, so it highlights on `/salaries` with no change to `AppLayout` (a test now covers it). "Analytics" is untouched.
- Docs: this file, `docs/04-implementation-status.md`, `README.md`, `backend/README.md`, `frontend/README.md`, and a pointer in the salary management summary.

## API

`GET /api/salaries` (ADMIN and HR_MANAGER; 401 unauthenticated, 403 otherwise).

| Query | Values | Default |
|---|---|---|
| `page`, `pageSize` | integer >= 1; pageSize <= 100 (UI offers 10/20/50) | 1, 20 |
| `q` | name, employee ID or email, max 100 chars | none |
| `departmentId`, `country` | UUID, supported country code | none |
| `status` | `ACTIVE`, `INACTIVE`, `ALL` | `ACTIVE` |
| `salary` | `with`, `without` (has a current salary) | none |
| `sortBy` | `name`, `employeeCode`, `department`, `country`, `effectiveDate` | `name` |
| `sortOrder` | `asc`, `desc` | `asc` |

Response: `{ data: Row[], pagination: { page, pageSize, total, totalPages } }` with `Row = { employee: { id, employeeCode, firstName, lastName, email, department: {id, name}, country, status }, current: null | { id, currency, effectiveDate, gross, net, deductions, reason }, hasScheduled }`. Amounts are decimal strings in the record's own currency. Unknown keys or invalid values: 400 `VALIDATION_ERROR`.

## Frontend behaviour

- All list state lives in the URL. The frontend omits default values from the URL (`status=ACTIVE`, sort by name ascending, page 1, pageSize 20), and invalid or tampered values fall back to defaults. A page past the end redirects to the last page; an empty last page does not redirect.
- Filters: search (300 ms debounce, same keystroke/URL-echo handling as Employees), Department, Country, Status (Active, Inactive, All), Salary (All, With salary, Without salary), Clear filters (keeps sort and page size). Any filter change resets to page 1.
- Table columns: Employee (name links to `/employees/:id`, an "Inactive" chip when inactive), Employee ID, Department, Country, Currency, Gross, Net, Effective date (plus a "Scheduled" chip when `hasScheduled`). Amounts use `formatMoney(amount, currency)`; employees with no current salary show a muted "No salary" in the Gross and Net cells.
- Sortable headers: Employee (name), Employee ID, Department, Country, Effective date. Pagination uses MUI `TablePagination`.
- States: loading bar plus dimmed table while navigating, "No employees match your filters" (with Clear filters) versus "No employees yet", and an inline error alert with "Try again" through the route `ErrorBoundary`. 401 redirects to `/login`.
- Debounce and rapid-change handling mirror Employees: changes apply to a `latest` ref, not the render snapshot.

## Decisions

- Active employees only by default, because the page answers "what do we pay people now"; Inactive and All are one click away.
- No sorting by gross or net: rows are in different currencies, and converting would need rates. Sorting by effective date is offered instead.
- No totals, averages or export: those belong to Analytics (Phase 2) and Import/Export (Phase 3). The page is a read-only list; set and revise stay on the employee profile.
- A separate `SalaryDirectoryFilters` and `SalaryDirectoryTable` rather than parameterising the Employees ones: the status options, the extra Salary filter, the columns and the sort fields all differ, so sharing would have meant flags everywhere. The duplicated piece is the ~25-line search debounce (see follow-ups).
- `hasScheduled` is shown even when there is no current salary (a first salary dated in the future).
- Reuses `apiCall`, `PAGE_SIZES`, `listDepartments`, `StatusChip` and `formatMoney`; no new dependencies.

## Tests and checks (final run)

- Frontend: `bun run typecheck` clean; `bun run test` 28 files, 207 tests passing (up from 24 files, 172 tests (35 new)); `bun run build` succeeds. New: `salary-directory-api.test.ts` (10: defaults, valid and tampered params, serialisation, query building and cookie forwarding, 401 redirect, error result), `SalaryDirectoryTable.test.tsx` (6: columns, link, `₹1,250,000.50` / `₹1,100,000.25` and `¥600,000` formatting, No salary row, Scheduled chip with and without a current salary, inactive chip, sort headers and no amount sorting), `SalaryDirectoryFilters.test.tsx` (5), `routes/salaries.test.tsx` (12: URL params to API query, defaults omitted, tampered params, empty states, Clear filters keeps sort, filter changes update the URL and reset the page, search plus department race, sort click, page redirect, no redirect on empty last page, error boundary, 401), `routes.test.ts` (salaries route registered) and `AppLayout.test.tsx` (Salaries highlighted on `/salaries`).
- Backend: `bun run test` 16 files, 194 tests passing (run again at the end of this task).
- Manual pass (curl, backend on port 3002 and frontend dev server on 5199 because port 3001 is held by the Docker backend container running older code without `/api/salaries`; seeded DB, cookie jar, login as the seeded admin): unauthenticated `/salaries` returns 302 to `/login`. Authenticated `/salaries` returns 200 with `EMP-0001`..`EMP-0004` and `EMP-0007`, `1–5 of 5`, amounts such as `₹2,760,000.00` / `₹2,616,000.00`, `$87,000.00` and `£57,400.00`, 4 "No salary" cells (two rows without salary) and one Scheduled chip. Query filters: `salary=without` 2 rows, `salary=with` 3, `status=ALL` 6, `status=INACTIVE` 1, `country=IN&status=ALL` 1, `q=zzzzzz` shows "No employees match your filters", `page=999` redirects to `/salaries`, `sortBy=effectiveDate&sortOrder=desc` marks the header `aria-sort="descending"`, and the sidebar Salaries item is selected. Only GET requests were made, so the DB is unchanged; both dev servers were stopped.
- **No real-browser click-through was performed**: the filter inputs, debounce, header sort clicks, pagination controls and layout are covered by component and route tests with jsdom only, and the curl pass checks server-rendered output.

## Known limitations

- Read-only: no create, revise or export from the directory.
- "Current" is by UTC date on the server.
- Mixed currencies are shown as-is; no totals or conversion.
- No per-department or per-country subtotals (Analytics).

## Known follow-ups (deferred review minors)

- The backend pagination test does not combine the salary and department filters with paging.
- The directory service re-derives "current salary" and copies the `isoDate` / `todayUtc` helpers from `salary.service.ts`: a drift risk. Consider a shared helper plus a parity test against `GET /api/employees/:id/salaries`.
- The directory loads every historical record with its components for each page row, though only the current record needs components.
- The `contains` search helper is exported from `employee.service.ts`; it could move to `lib/`.
- `sortBy=effectiveDate` sorts in memory over all matching employees: fine at roughly 10k employees, revisit with SQL later.
- The search debounce in `SalaryDirectoryFilters` duplicates `EmployeeFilters`; extract a shared hook if a third list appears.
- No real-browser click-through yet (see above).

## Next session

Dashboard and Analytics (Phase 2) can reuse the directory's "current salary" logic once it is shared (see follow-ups); settle the pay-period question first. Alternatives: Audit (Phase 4) or CSV Import/Export (Phase 3; a salary CSV export could build on this list). Per `CLAUDE.md`: explain the plan and wait for approval; work on a feature branch, never on `main`.
