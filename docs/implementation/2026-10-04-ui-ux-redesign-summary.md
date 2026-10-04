# UI/UX Redesign Summary

Date: 2026-10-04. Branch: `feature/ui-ux-redesign`. Spec: `docs/superpowers/specs/2026-10-04-ui-ux-redesign-design.md`. Plan: `docs/superpowers/plans/2026-10-04-ui-ux-redesign.md`.

## Original task

The user asked to review all pages and features and give the app a light, professional, simple look with intentional components, layout, actions and pages. Use modals instead of pages where that fits. Think about navigation, UX, fields, user control and low cognitive load. Avoid overlap between pages. Do the work on a new branch.

## What was completed

- Custom light MUI theme (`app/theme.ts`), applied to the app and to the root error boundary.
- Navigation reduced to Dashboard / Employees / Analytics in a sidebar-only shell; the signed-in user and a keyboard-operable Logout menu item sit at the bottom of the sidebar.
- `/employees` now lists each employee with their current salary (data from `GET /api/salaries`). URL-driven filters: `q`, `status` (ACTIVE / INACTIVE / ALL, default Active), `departmentId`, `country`, `salary` with/without, sort (name, department, country, joiningDate, and effectiveDate via the "Current salary" header, which shows a "since {date}" caption), pagination. A filter bar with a filters popover and a status toggle replaces the old selects.
- Add employee is a dialog (`?add=1`) with a searchable Country field (MUI Autocomplete). Success shows a toast with a "Set salary" action; the toast survives clicks elsewhere, closes when its action is followed, and a new toast restarts the 5s timer.
- Row menu: View, Edit, Set/Revise salary, Deactivate/Reactivate (with confirmation). Edit and salary open dialogs on the profile via `?edit=1` and `?salary=initial|revise`.
- Profile has Overview and Compensation tabs. Edit employee and Set/Revise salary are dialogs that are truly URL-driven: the header buttons and the Compensation empty state's "Set salary" button set `?edit=1` / `?salary=initial|revise`, and the param is cleared on close and after success. Toasts replace the old `?notice=` banners.
- Calendar dates (list, profile, compensation history, dashboard recent activity and as-of) render through one shared formatter, `app/lib/format-date.ts` ("Jan 15, 2020", read as UTC so the day never shifts). The analytics page keeps ISO dates next to its date inputs.
- `/salaries`, `/employees/new` and `/employees/:id/edit` are redirect-only routes (query string kept for `/salaries`).
- Dashboard: 4 stat tiles, an Attention card (employees without a salary, linking to `/employees?salary=without`) and recent hires / salary changes. No charts, salary overview or department/country blocks.
- Analytics page titled "Analytics", filters in one bar, charts use theme colours. Login and error pages restyled.
- Shared components: `ToastProvider`/`useToast` (optional action link), `FormDialog`, `EmptyState`, `Money`, `PageHeader` with breadcrumbs, `EmployeeFilterBar`, `EmployeeDirectoryTable`, `EmployeeFormDialog`.
- Removed: Salaries page and table/filter components, create and edit pages, old `EmployeeForm`, `MoneyList`, and the old `/api/employees` list helpers (`listEmployees`, `parseListParams`, `toSearchParams`, `DEFAULT_LIST_PARAMS`, `ListParams`, `SORT_FIELDS`, `SortField`).

## Decisions

- Salaries merged into Employees: both pages showed the same people, so one list with salary columns removes the overlap.
- Dialogs for create, edit, salary and confirmation. Profile dialogs are driven by URL params so they are linkable and survive reloads.
- Edit wins when `?edit=1` and `?salary=` are both present. Unrecognised `?salary=` values are stripped.
- Fetcher results are handled only when the fetcher is idle (`useFetcherResult`), so a URL change does not abort the profile's post-save revalidation. Regression tests cover this with a parent route loader.
- Toast API: `success(text, action?: { label, to })`.
- Deliberate simplifications of the spec: the shell is sidebar-only (no white top bar; the user menu lives in the sidebar), and list loading shows a `LinearProgress` bar over the dimmed table instead of skeleton rows.
- Money renders through `Intl` ("$120,000.00" style), consistent with profile and analytics, not "USD 120,000". Currency symbols still distinguish currencies.

## API and database changes

- One additive API change: `GET /api/salaries` rows gain `employee.designation` and `employee.joiningDate`, and `sortBy=joiningDate` is accepted. No other endpoint changed.
- No database or Prisma schema change.

## Tests

- Backend: 20 files, 242 tests pass.
- Frontend: 37 files, 297 tests pass; `npm run typecheck` and `npm run build` are clean.
- New or rewritten tests cover the theme-dependent components, list route (including last-page redirect and search/department race), profile dialogs, redirects, dashboard and the root error boundary.

## Known limitations

- Employee ID is still typed by the user (no auto-generation).
- No mobile layout and no dark mode.
- No sort by salary amount.
- No real-browser walkthrough was done by the implementing tasks; the automated suites are jsdom only. A manual walkthrough is a separate step.
- `BarChartCard` is still used by the analytics page and is kept.
- Deferred minors: backend sort test mutates employee 004 `joiningDate` without restoring it; FormDialog always labels the submitting button "Saving…" and its submitting test only checks Cancel; EmployeeFormDialog reset effect keys on `open` only and the "Cannot be changed" helper hides an `employeeCode` error; an out-of-range page redirect drops `?add=1`; the all-inactive state shows "No employees yet"; deactivate confirm closes on failure; salary history is sorted twice (profile and CompensationSection); departments are refetched on each profile revalidation; one profile test uses a weak `setTimeout(50)` negative assertion; SalaryFormDialog typing nits; the 404 root test uses a plain-object stand-in; unindented JSX in the root ErrorBoundary wrapper.
- Fixed in the final review wave: keyboard logout, toast exit flicker/clickaway/timer, effective-date sort, backend README directory shape, searchable country, dead list helpers and `MoneyList`, URL-driven profile salary button, guarded list action JSON, popup ARIA on menus/filters, `useId` dialog labels, resolvable tab `aria-controls`, shared date formatting, and a Set salary action in the empty Compensation state.

## Next steps

1. Run the manual browser walkthrough (login, nav, list search/filters/sort/pagination/empty states, Add dialog errors, row menu, profile tabs, edit and salary dialogs, deactivate/reactivate, the three redirects, dashboard attention link, analytics, logout) and fix defects with tests.
2. Open a PR from `feature/ui-ux-redesign` to `main` (needs user approval).
3. Address the remaining deferred minors listed above.
4. Later ideas: employee ID suggestion, amount sorting, responsive layout, dark mode.
