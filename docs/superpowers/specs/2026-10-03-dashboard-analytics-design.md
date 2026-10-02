# Dashboard and Salary Analytics Design

Date: 2026-10-03
Status: Draft, awaiting review

## 1. Purpose

Give HR managers a quick organisation overview (Dashboard, UC-DASH-01..04) and a deeper, filterable exploration of compensation (Salary Analytics, UC-ANA-01..04). Both modules are read-only and aggregate data that Employee and Salary Management already store. No schema change, no migration.

Out of scope: currency conversion, a "level" field, annualisation, CSV export, the Audit module, saved views, per-employee salary views (the Salary directory and profile already cover those).

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | No "level" dimension. Role analysis groups by `designation`. Level is a known limitation. | `Employee` has no level field; inferring it from titles would be a guess. |
| 2 | Currencies never mix. Every monetary aggregate (total, average, median, min, max, percentiles, buckets) is computed per currency and returned as one entry per currency. Headline cards show counts plus a per-currency list; there is no single cross-currency total. | Docs: keep currencies separate; no conversion in v1. |
| 3 | Add `recharts` to the frontend. | Already the documented chart library (`docs/02`); the only new dependency. |
| 4 | "Recent activity" uses existing timestamps: newest employees by `Employee.createdAt`; newest salary revisions by `SalaryRecord.createdAt`, with `createdBy`. A revision is a record that has an earlier record for the same employee. | No audit table until Phase 4. |
| 5 | Salary basis: `gross` (default) or `net` (`basis` query param), per period as entered. Gross = BASE + ALLOWANCE + BONUS; net = gross - DEDUCTION, as in Salary Management. | One definition shared with the Salary module; no annualisation concept exists. |
| 6 | Population for money metrics is each employee's current salary as of an "as of" date (default today, UTC): the record with the latest `effectiveDate <= asOf`. Scheduled records are ignored. Employees with no such record are counted in headcount and in a `withoutSalary` count, and excluded from money metrics. | Matches the Salary module's current/scheduled rule. No inference of missing data. |
| 7 | Status: Dashboard money metrics cover ACTIVE employees only; headcount shows total and active. Analytics has a `status` filter (`ACTIVE` default, `INACTIVE`, `ALL`). | Employee spec: inactive staff are excluded from metrics unless asked for. |
| 8 | Statistics: count, total, average, median, min, max, p25, p75. Median and percentiles use Postgres `percentile_cont` over the per-currency population. Amounts are `numeric` in SQL, rounded to 2 dp, returned as decimal strings. | Docs ask for median; no float arithmetic on money in transit. |
| 9 | Distribution: 10 equal-width buckets per currency between that currency's min and max (a single bucket when min = max). Each bucket: `from`, `to`, `count`. | Simple, readable, deterministic. |
| 10 | Trends: per calendar month of `effectiveDate` inside `[from, to]`, per currency: `revisionCount` (non-initial records), `newSalaryCount` (initial records), `avgChangePercent` over revisions whose previous record has the same currency (null if none), `avgGross`/`avgNet` of all records effective that month. Range defaults to the last 12 months, capped at today, max 60 months. | Uses salary history and effective dates, per UC-ANA-03. |
| 11 | Group comparison: `groupBy` = `department` \| `country` \| `designation`. Each group returns headcount, `withoutSalary` and per-currency stats. A currency entry with fewer than 3 salaried employees is `suppressed: true` and carries counts only. | Avoids showing the exact salary of one or two people in a comparison view. This is a privacy convention, not a security boundary: ADMIN and HR_MANAGER can already see every salary in the directory. |
| 12 | Filters (shared by all Analytics endpoints): `departmentId`, `country`, `designation` (exact), `status`, `currency`, `basis`, `asOf`, and for trends `from`/`to`. Unknown params are rejected (400). | UC-ANA-04. |
| 13 | Aggregation is done in Postgres with parameterised raw SQL (`prisma.$queryRaw` with `Prisma.sql` fragments). One shared "current salary per employee" CTE (`DISTINCT ON (employeeId) ... ORDER BY employeeId, effectiveDate DESC`, served by the existing `(employeeId, effectiveDate)` unique index) is used by every endpoint. | Efficient for large datasets; one definition of "current". |
| 14 | Auth: all endpoints use `requireAuth` + `requireRole("ADMIN","HR_MANAGER")`. | Same as Salary. |

## 3. API

All under `requireAuth` + `requireRole`. Errors: `{ error: { message, code? } }`; 400 invalid query, 401, 403.

| Method | Path | Result |
|---|---|---|
| GET | `/api/dashboard` | Overview, departments, countries, recent activity |
| GET | `/api/analytics/summary` | `{ asOf, basis, headcount: {total, active, inactive, withSalary, withoutSalary}, currencies: [CurrencyStats] }` |
| GET | `/api/analytics/distribution` | `{ asOf, basis, currencies: [{ currency, count, buckets: [{from, to, count}] }] }` |
| GET | `/api/analytics/groups` | `{ asOf, basis, groupBy, groups: [{ key, label, headcount, withoutSalary, currencies: [CurrencyStats \| Suppressed] }] }` |
| GET | `/api/analytics/trends` | `{ from, to, basis, currencies: [{ currency, months: [{ month, revisionCount, newSalaryCount, avgChangePercent, avgGross, avgNet }] }] }` |
| GET | `/api/analytics/filters` | Option lists for the filter bar: departments, countries in use, designations in use, currencies in use |

`CurrencyStats` = `{ currency, count, total, average, median, min, max, p25, p75 }`; `Suppressed` = `{ currency, count, suppressed: true }`. All money values are decimal strings with two decimals. Currency entries are sorted by `count` descending, then code.

`/api/dashboard` (active employees only for money; `basis=gross`, as of today):

```
{
  asOf,
  metrics: { totalEmployees, activeEmployees, departmentCount, countryCount, withoutSalary,
             currencies: [CurrencyStats] },
  departments: [{ id, name, headcount, currencies: [{ currency, count, total, average }] }],
  countries:   [{ country, headcount, currencies: [{ currency, count, total, average }] }],
  recentEmployees: [{ id, employeeCode, name, department, joiningDate, createdAt }],      // 5 newest
  recentRevisions: [{ id, employee: {id, employeeCode, name}, currency, effectiveDate,
                      gross, changePercent | null, reason, createdBy: {id, name}, createdAt }]  // 5 newest
}
```

Departments and countries are sorted by headcount descending. Departments with zero active employees are listed with headcount 0 and no currencies.

Query rules: `asOf`, `from`, `to` are `YYYY-MM-DD` real dates; `to` may not be in the future and `from` must not be after `to`; `from`/`to` default as in decision 10. `country` is a code from the supported list, `currency` is from the supported list, `departmentId` is a UUID, `designation` is 1-100 characters.

## 4. Backend layout

`modules/analytics/`:

- `analytics.schema.ts`: zod query schemas (strict).
- `analytics.sql.ts`: builds the shared filter and "current salary" SQL fragments.
- `analytics.service.ts`: `getSummary`, `getDistribution`, `getGroups`, `getTrends`, `getFilterOptions`.
- `dashboard.service.ts`: `getDashboard` (reuses the `analytics.sql.ts` fragments).
- `analytics.controller.ts`, `analytics.routes.ts` (mounted at `/api/analytics`), `dashboard.routes.ts` (at `/api/dashboard`).

Reuse: `computeChange` / `toCents` from `salary.calc.ts` for `changePercent`, the currency and country lists from `lib/`. Net/gross are computed in SQL from component rows with the same type rule (`DEDUCTION` subtracts).

## 5. Frontend

- `/dashboard` (rebuilt): metric cards (total, active, departments, countries, without salary), a per-currency salary card (total, average, median), department panel (bar chart of headcount plus a table with per-currency total/average), country panel (same), recent employees list, recent revisions list. Link to Analytics.
- `/analytics` (new, nav item): one shared filter bar (department, country, designation, status, currency, basis, as-of date, trend range) with URL-param state and a Reset action. Panels: summary stat cards, distribution histogram, group comparison (group-by toggle, bar chart + table), trend line/bar chart, role (designation) table. When several currencies are present, each panel shows a currency selector (default: the most populous currency; the `currency` filter pins it). Every monetary value shows its currency code; every panel states the "as of" date or range and the basis.
- Charts via `recharts`, rendered client-side only (a `ClientOnly` wrapper, since `ResponsiveContainer` needs a browser). Tables carry the same data, so the page is readable without charts.
- Loader pattern as in `salaries.tsx`: one loader fetches all panels in parallel with `apiFetchAs`; a 401 redirects to login. A failed panel fetch shows an inline error in that panel only. States: loading (navigation pending), empty ("No salary data for these filters"), error.
- Responsive: cards and panels stack on small screens; tables scroll horizontally.

## 6. Testing

Backend (Vitest + Supertest, local Postgres, unique test data per run, cleanup): current-salary selection (future-dated record ignored, latest past record wins, asOf in the past uses history); basis gross vs net with deductions; stats exactness (total, average, median, p25/p75 with odd and even counts); two currencies are never combined; inactive excluded by default and included with `status`; employees with no salary counted in `withoutSalary`; each filter alone and in combination; groups by department/country/designation with suppression under 3; distribution bucket edges (single value, all equal, bucket counts sum to the population); trends (month grouping, revision vs initial, change percent skips cross-currency, range defaults and the 60-month cap); empty dataset returns empty arrays and zero counts; dashboard shape, recent lists limited to 5 and ordered; 400 for bad params and unknown keys; 401 without cookie; 403 for a forged role.

Frontend (Vitest + RTL, `ResizeObserver` stubbed): `analytics-api` URL building; filter bar emits URL params and resets; each panel renders data, empty and error states; currency selector switching; dashboard cards, per-currency display, recent lists; loader redirects on 401; routes registered.

Checks: backend and frontend `typecheck` and `test`, frontend `build`. No lint script exists. Manual curl pass against dev servers; a real-browser click-through is not done unless performed, and the summary will say so.

## 7. Documentation

Update `docs/04-implementation-status.md`, `docs/03-modules-and-use-cases.md` only where behaviour diverges, `docs/02-tech-stack-and-architecture.md` (Recharts now installed), the READMEs, and add `docs/implementation/2026-10-03-dashboard-analytics-summary.md` (task, work done, metric definitions, endpoints, filters, decisions, tests, limitations, next steps).

## 8. Known limitations (accepted)

- No level dimension; role analysis is by free-text `designation` (spelling variants form separate groups).
- No currency conversion; no cross-currency totals.
- Amounts are per period as entered; mixed pay periods are not distinguished.
- Recent activity is derived from `createdAt`; employee edits are not tracked until the Audit module.
- "Today" and "as of" are evaluated in UTC on the server.
- Group suppression (fewer than 3) is a convention, not access control.
- Median and percentiles are computed per request; no caching or materialised views.
