# UI/UX Redesign Summary

Date: 2026-10-04. Branch: `feature/ui-ux-redesign`. Spec: `docs/superpowers/specs/2026-10-04-ui-ux-redesign-design.md`. Plan: `docs/superpowers/plans/2026-10-04-ui-ux-redesign.md`.

## Original task

The user asked to review all pages and features and give the app a light, professional, simple look with intentional components, layout, actions and pages. Use modals instead of pages where that fits. Think about navigation, UX, fields, user control and low cognitive load. Avoid overlap between pages. Do the work on a new branch.

## What was completed

- Custom light MUI theme (`app/theme.ts`), applied to the app and to the root error boundary.
- Navigation reduced to Dashboard / Employees / Analytics.
- `/employees` now lists each employee with their current salary (data from `GET /api/salaries`). URL-driven filters: `q`, `status` (ACTIVE / INACTIVE / ALL, default Active), `departmentId`, `country`, `salary` with/without, sort (name, department, country, joiningDate, effectiveDate), pagination. A filter bar with a filters popover and a status toggle replaces the old selects.
- Add employee is a dialog (`?add=1`). Success shows a toast with a "Set salary" action.
- Row menu: View, Edit, Set/Revise salary, Deactivate/Reactivate (with confirmation). Edit and salary open dialogs on the profile via `?edit=1` and `?salary=initial|revise`.
- Profile has Overview and Compensation tabs. Edit employee and Set/Revise salary are dialogs, URL-driven and cleared on close and after success. Toasts replace the old `?notice=` banners.
- `/salaries`, `/employees/new` and `/employees/:id/edit` are redirect-only routes (query string kept for `/salaries`).
- Dashboard: 4 stat tiles, an Attention card (employees without a salary, linking to `/employees?salary=without`) and recent hires / salary changes. No charts, salary overview or department/country blocks.
- Analytics page titled "Analytics", filters in one bar, charts use theme colours. Login and error pages restyled.
- Shared components: `ToastProvider`/`useToast` (optional action link), `FormDialog`, `EmptyState`, `Money`, `PageHeader` with breadcrumbs, `EmployeeFilterBar`, `EmployeeDirectoryTable`, `EmployeeFormDialog`.
- Removed: Salaries page and table/filter components, create and edit pages, old `EmployeeForm`.

## Decisions

- Salaries merged into Employees: both pages showed the same people, so one list with salary columns removes the overlap.
- Dialogs for create, edit, salary and confirmation. Profile dialogs are driven by URL params so they are linkable and survive reloads.
- Edit wins when `?edit=1` and `?salary=` are both present. Unrecognised `?salary=` values are stripped.
- Fetcher results are handled only when the fetcher is idle (`useFetcherResult`), so a URL change does not abort the profile's post-save revalidation. Regression tests cover this with a parent route loader.
- Toast API: `success(text, action?: { label, to })`.
- Money renders through `Intl` ("$120,000.00" style), consistent with profile and analytics, not "USD 120,000". Currency symbols still distinguish currencies.

## API and database changes

- One additive API change: `GET /api/salaries` rows gain `employee.designation` and `employee.joiningDate`, and `sortBy=joiningDate` is accepted. No other endpoint changed.
- No database or Prisma schema change.

## Tests

- Backend: 20 files, 242 tests pass.
- Frontend: 36 files, 283 tests pass; `npm run typecheck` and `npm run build` are clean.
- New or rewritten tests cover the theme-dependent components, list route (including last-page redirect and search/department race), profile dialogs, redirects, dashboard and the root error boundary.

## Known limitations

- Employee ID is still typed by the user (no auto-generation).
- No mobile layout and no dark mode.
- No sort by salary amount.
- No real-browser walkthrough was done by the implementing tasks; the automated suites are jsdom only. A manual walkthrough is a separate step.
- `listEmployees`, `parseListParams`, `toSearchParams` and `DEFAULT_LIST_PARAMS` in `app/lib/employees-api.ts` are now unused outside tests and can be removed.
- Unused components `BarChartCard`, `MoneyList` remain only where tests or analytics reference them.
- Deferred minors: backend sort test mutates employee 004 `joiningDate` without restoring it; ToastProvider unmounts the Alert on dismiss (no exit transition); FormDialog uses a hardcoded `aria-labelledby` id and always labels the submitting button "Saving…"; logout MenuItem wraps a nested Button; EmployeeFormDialog reset effect keys on `open` only and the "Cannot be changed" helper hides an `employeeCode` error; an out-of-range page redirect drops `?add=1`; the all-inactive state shows "No employees yet"; deactivate confirm closes on failure; `request.json()` is unguarded in the list action; salary history is sorted twice (profile and CompensationSection); departments are refetched on each profile revalidation; one profile test uses a weak `setTimeout(50)` negative assertion; the 404 root test uses a plain-object stand-in.

## Next steps

1. Run the manual browser walkthrough (login, nav, list search/filters/sort/pagination/empty states, Add dialog errors, row menu, profile tabs, edit and salary dialogs, deactivate/reactivate, the three redirects, dashboard attention link, analytics, logout) and fix defects with tests.
2. Open a PR from `feature/ui-ux-redesign` to `main` (needs user approval).
3. Clean up the dead list helpers and the deferred minors.
4. Later ideas: employee ID suggestion, amount sorting, responsive layout, dark mode.
