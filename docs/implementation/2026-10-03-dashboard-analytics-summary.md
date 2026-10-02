# Dashboard and Salary Analytics: Implementation Summary

Date: 2026-10-03. Branch: `feature/dashboard-analytics`. Builds on Employee Management, Salary Management and the Salary directory. Design: [spec](../superpowers/specs/2026-10-03-dashboard-analytics-design.md).

## Original task

Build the Dashboard and Salary Analytics modules (Phase 2): a rebuilt `/dashboard` with an organisation overview (counts, per-currency salary figures, department and country summaries, recent changes) and a new `/analytics` page for filterable exploration (summary statistics, distribution, group comparison, trends over time). Read-only, no schema change. Currencies must never be mixed (no conversion, no cross-currency totals), every monetary value names its currency, and nothing may expose salary data to anyone beyond the existing ADMIN and HR_MANAGER roles.

## What was completed

- Backend, `backend/src/modules/analytics/`: `analytics.schema.ts` (strict zod query schemas), `analytics.sql.ts` (shared employee filter and "current salary" CTEs, `STATS_COLUMNS`), `analytics.dates.ts`, `analytics.service.ts` (`getSummary`, `getDistribution`, `getGroups`, `getFilterOptions`, `getTrends`), `dashboard.service.ts` (`getDashboard`, `getRecentRevisions`), controller and two routers mounted at `/api/analytics` and `/api/dashboard`. All aggregation is Postgres raw SQL (`prisma.$queryRaw` with `Prisma.sql`). Commits `a5f530b`..`8cf4003`.
- Frontend: `lib/analytics-api.ts` (types, param parse/serialise, fetchers), `routes/dashboard.tsx` (rebuilt), `routes/analytics.tsx` (new, registered as `analytics`), `components/analytics/` (`AnalyticsFilters`, `StatCards`, `DistributionChart`, `BarChartCard`, `TrendChart`, `ChartCard`, `ClientOnly`, `GroupTable`, `MetricCard`, `MoneyList`, `RecentActivity`). `recharts` added (the only new dependency). The Analytics nav item already existed in `AppLayout`; a test was added. Commits `8cf4003`..`bb6de0b`.
- Database: none. No migration, no schema change.
- Docs: this file, the spec (implementation deltas), `docs/02`, `docs/03`, `docs/04`, `README.md`, `backend/README.md`, `frontend/README.md`.

## API

All routes require a session with role ADMIN or HR_MANAGER. Errors: `{ error: { message, code? } }`. 400 `VALIDATION_ERROR` (bad value or unknown param; all schemas are strict), 400 `INVALID_DATE_RANGE` (trends only), 401 unauthenticated, 403 wrong role.

| Method and path | Query | Response |
|---|---|---|
| `GET /api/dashboard` | none (any param is a 400) | `{ asOf, metrics: { totalEmployees, activeEmployees, departmentCount, countryCount, withoutSalary, currencies: [CurrencyStats] }, departments: [{ id, name, headcount, currencies: [{ currency, count, total, average }] }], countries: [{ country, headcount, currencies }], recentEmployees (5), recentRevisions (5) }` |
| `GET /api/analytics/summary` | filters + `asOf` | `{ asOf, basis, headcount: { total, active, inactive, withSalary, withoutSalary }, currencies: [CurrencyStats] }` |
| `GET /api/analytics/distribution` | filters + `asOf` | `{ asOf, basis, currencies: [{ currency, count, buckets: [{ from, to, count }] }] }` |
| `GET /api/analytics/groups` | filters + `asOf`, `groupBy` | `{ asOf, basis, groupBy, groups: [{ key, label, headcount, withoutSalary, currencies: [CurrencyStats or { currency, count, suppressed: true }] }] }` |
| `GET /api/analytics/trends` | filters + `from`, `to` (no `asOf`) | `{ from, to, basis, currencies: [{ currency, months: [{ month, revisionCount, newSalaryCount, avgChangePercent, avgGross, avgNet }] }] }` |
| `GET /api/analytics/filters` | none | `{ departments: [{id, name}], countries, designations, currencies }` (values in use) |

Filter params (shared): `departmentId` (UUID), `country` (supported code), `designation` (exact, 1-100 chars), `status` (`ACTIVE` default, `INACTIVE`, `ALL`), `currency` (supported code), `basis` (`gross` default, `net`). `asOf`, `from`, `to` are real `YYYY-MM-DD` dates. `groupBy` is `department` (default), `country` or `designation`.

`CurrencyStats = { currency, count, total, average, median, min, max, p25, p75 }`, money as decimal strings with 2 dp. `recentEmployees` items: `{ id, employeeCode, name, department, joiningDate, createdAt }`. `recentRevisions` items: `{ id, employee: { id, employeeCode, name }, currency, effectiveDate, gross, changePercent | null, reason, createdBy: { id, name }, createdAt }`.

`INVALID_DATE_RANGE`: `to` in the future, `from` after `to`, or more than 60 months in range.

## Metric definitions

- **Current salary.** Per employee, the record with the latest `effectiveDate <= asOf` (UTC, default today). Scheduled (future) records are ignored. Employees with no such record count only in `withoutSalary` and never enter money metrics. One shared CTE (`DISTINCT ON (employeeId) ... ORDER BY employeeId, effectiveDate DESC`) serves summary, distribution, groups and dashboard.
- **Basis.** `gross` = BASE + ALLOWANCE + BONUS; `net` = gross - DEDUCTION. Per period as entered; no annualisation.
- **Per currency, always.** Every monetary aggregate is one entry per currency; entries are ordered by count descending, then code (trends order currencies by total activity in the range, then code). There is no total across currencies anywhere.
- **Stats.** count, total, average, median, min, max, p25, p75. Median and quartiles use `percentile_cont` (which works on double precision), cast to numeric and rounded to 2 dp; the other values are numeric sums rounded to 2 dp.
- **Distribution.** Per currency, bucket on integer cents between that currency's min and max. Up to 10 equal-width buckets; when the span is under 10 cents the count is `min(10, span + 1)` (one bucket per cent); one bucket when min equals max. Bucket `from`/`to` are inclusive decimal strings; counts sum to the population.
- **Trends.** Monthly by `effectiveDate` inside `[from, to]` (defaults: `to` = today, `from` = first day of the month 11 months earlier; `to` cannot be in the future; max 60 months). Per currency: `revisionCount` (records with an earlier record for the same employee), `newSalaryCount` (first records), `avgChangePercent` (revisions whose previous record has the same currency and a positive previous value; null if none), `avgGross` and `avgNet` over all records that month. Months are zero-filled in the API (counts 0, averages null); the analytics page chart gets all months, but its monthly table lists only months with activity. Uses the status, department, country and designation filters; `asOf` is not used.
- **Group comparison.** Group by department, country or designation (spelling variants of designation are separate groups). Returns `headcount`, `withoutSalary` and per-currency stats. A currency entry with fewer than 3 salaried employees is `{ currency, count, suppressed: true }`. This is a privacy convention for the comparison view, not access control: ADMIN and HR_MANAGER already see every salary in the directory.
- **Headcount semantics (summary).** `headcount.total`, `active` and `inactive` ignore the `status` filter (they respect department, country and designation). `withSalary` and `withoutSalary` follow the status filter. The `currency` filter only trims the `currencies` rows; it does not change headcount.
- **Dashboard.** ACTIVE employees only, gross, as of today. `totalEmployees` counts all employees (active and inactive). `departmentCount` = all departments (including empty ones); `countryCount` = countries that have active employees. Departments are listed with headcount (0 and no currencies if empty) sorted by headcount. Department and country money is not suppressed (`suppress: false`). Recent employees: 5 newest by `Employee.createdAt`. Recent revisions: 5 newest by `SalaryRecord.createdAt` among records that have an earlier record for the employee; `changePercent` is null when the currency changed.

## Frontend behaviour

- `/dashboard`: five metric cards, a per-currency salary overview (count, total, average, median), department and country panels (bar chart of headcount plus a table of per-currency total and average; tables scroll horizontally on small screens), recent employees and recent revisions lists, link to Analytics. The dashboard keeps the "Signed in as ..." greeting. A failed load shows the route error boundary with "Try again".
- `/analytics`: one filter bar (Department, Country, Role, Status, Currency, Basis, As of, From, To, Reset filters), all state in the URL; invalid or tampered values fall back to defaults. Panels: Compensation summary stat cards, Salary distribution, Compare groups (Department / Country / Role toggle, bar chart of average plus table), Salary trends (chart plus monthly table). Each panel states basis, currency and as-of date or range, and shows its own empty or error state.
- Currency: one shared selector. The effective currency is the `currency` param, or else the most populous currency from the summary (ties by code). The loader is two-phase: summary and filter options first, then distribution, groups and trends with the effective currency. Authentication failures are handled by the shared `apiCall` helper and the authenticated layout.
- Charts (Recharts) render client-side only (`ClientOnly`), have `role="img"` with a label, and every chart sits next to a table with the same exact values, so the page works without charts.
- `fetchAnalytics` omits params equal to the defaults (`status=ACTIVE`, `basis=gross`, `groupBy=department`); the backend defaults are identical.

## Decisions

- Ruling: no level dimension; role analysis uses `designation` (the Employee model has no level).
- Ruling: one shared currency selector in the filter bar instead of per-panel selectors (simpler, one URL param, consistent panels). Recorded as a spec delta.
- `suppress` flag on `getGroups` (default true): the dashboard turns it off, the comparison view keeps it.
- Recent activity derives from `createdAt` and covers new employees and salary revisions only; employee edits are not tracked until the Audit module.
- No caching or materialised views; each request aggregates in Postgres. The existing `(employeeId, effectiveDate)` unique index serves the current-salary lookup.
- Reused `computeTotals` / `computeChange` from `salary.calc.ts` for recent revisions, and `apiCall` / `formatMoney` / `PageHeader` on the frontend.

## Tests and checks (final run, this task)

- Backend: `bun run typecheck` clean; `bun run test` 20 files, 238 tests passing (against local Postgres).
- Frontend: `bun run typecheck` clean; `bun run test` 34 files, 252 tests passing; `bun run build` succeeds.
- Backend coverage (`analytics.summary/groups/trends`, `dashboard` tests): current-salary selection, basis, stat exactness, per-currency separation, status and each filter, no-salary counts, distribution edges, group suppression, trends rules and range errors, dashboard shape and recent lists, 400/401/403.
- Frontend coverage: `analytics-api` (params, fetchers, defaults omitted), filters, panels and tables (data, empty, error), dashboard components, routes, AppLayout nav.
- Manual pass (curl, not a browser): backend from source on port 3101 and the frontend dev server on 3100 against the seeded dev DB, logged in as the seeded admin. Unauthenticated `/dashboard` and `/analytics` return 302 to `/login`. Authenticated `/dashboard`, `/analytics`, `/analytics?currency=INR&basis=net`, `/analytics?country=ZZ` and `/analytics?groupBy=country&status=ALL` return 200. The SSR HTML showed the expected headings, per-currency amounts (INR/net showed rupees only, no GBP or USD amounts mixed) and the empty state in the Trends panel (the default 12-month window excludes the seed revisions dated 2022/2023). All six API endpoints return 200 and an unknown param returns 400; no response contained a total across currencies. Servers were stopped afterwards.
- **No real-browser click-through was performed.** Charts render client-side only, so the SSR HTML contained tables, not chart SVGs; Recharts rendering, hydration, the visual layout and real filter interaction (date typing, toggles) are covered by jsdom tests only.

## Known limitations

- No level dimension; role analysis is by free-text `designation`.
- No currency conversion and no cross-currency totals; the dashboard has no single headline total.
- Amounts are per period as entered; mixed pay periods are not distinguished.
- Recent activity is derived from `createdAt`, covers salary revisions and new employees only, and does not track employee edits until Audit.
- "Today" and "as of" are UTC on the server.
- Group suppression (under 3) is a convention, not access control.
- Median and percentiles are computed per request (no caching); `percentile_cont` uses double precision before rounding to 2 dp.
- Charts plot display-only floats (`Number(...)`); the exact decimal strings are in the adjacent tables.
- `getRecentRevisions` does up to `limit` (5) follow-up queries for the previous record (N+1); the exported `limit` is unbounded.
- The seed has revisions dated 2022 and 2023 (EMP-0001, EMP-0002), so the Trends panel shows its empty state on seed data only because the default window is the last 12 months; for example `from=2021-01-01&to=2023-12-31` shows them. The dashboard recent-revisions list is non-empty on seed data.
- Date inputs can emit partial-year dates (for example `0002-01-31`) while typing, causing a junk navigation; the UI has no `from > to` guard (the backend returns 400 `INVALID_DATE_RANGE`, shown inline in the Trends panel).
- If the groups call fails, the Compare groups panel shows only the error, so the group-by toggle is hidden (state stays in the URL).
- `prettier` is not configured; there is no lint script.
- No real-browser click-through (see above).

## Known follow-ups (deferred review minors)

- Backend: no test for the distribution span under 10 cents; redundant positional `ORDER BY` in the `getGroups` stats query; the trends "future-dated ignored" test only checks `status=ALL`, and the trends empty-currencies test depends on the clock; `any` types and an inline dynamic prisma import in the summary test; a dashboard test comment mentions unasserted cases.
- Frontend: no parse/serialise round-trip test; `hasActiveAnalyticsFilters` (counts asOf/from/to) is convoluted and untested; fetchers for summary and distribution, and non-default basis/status, are untested; chart colours are hard-coded hex; `ClientOnly` is untested; some tests use brittle DOM-depth selectors or `getAllByText`; the summary fixture does not discriminate the "most populous" ordering; panels fall back to their own first currency if the summary fails; there are two "Compensation summary" headings; no rapid-successive-change test; one misleading test name.

## Next session

- Import / Export (Phase 3; a CSV export of analytics could build on these endpoints) and Audit (Phase 4; would give real "recent activity" including employee edits).
- A level field on `Employee`, then a level dimension for groups and filters.
- Configured reporting currency and exchange rates, if cross-currency totals are wanted.
- Consider: clamp or debounce the date inputs, a from/to guard, a shared "current salary" helper with the salary directory (see its follow-ups), and a real-browser pass.
- Per `CLAUDE.md`: explain the plan and wait for approval; work on a feature branch, never on `main`.
