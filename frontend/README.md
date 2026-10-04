# Salary Management Frontend

React Router v8 (framework mode, SSR) + Material UI, run with Bun.

## Scripts

```bash
bun install
bun run dev        # dev server on http://localhost:5173
bun run build      # production build to build/
bun run start      # serve the build (PORT, default 3000)
bun run typecheck  # react-router typegen && tsc
bun run test       # Vitest + React Testing Library
```

## Environment

| Variable | Default | Notes |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3001` | Backend base URL used by the SSR server. Inlined at **build time** (`import.meta.env`); Docker passes it as a build arg (`http://backend:3001`). |

## Routes (`app/routes.ts`)

| Path | File | Notes |
|---|---|---|
| `/` | `routes/home.tsx` | Redirects to `/dashboard` |
| `/login` | `routes/login.tsx` | Form (React Hook Form + Zod); action calls backend login and relays `Set-Cookie` |
| `/logout` | `routes/logout.tsx` | Action calls backend logout, relays cleared cookie, redirects to `/login` |
| layout `routes/authenticated.tsx` | | Loader calls `GET /api/auth/me`; redirects to `/login` if not signed in. Wraps `AppLayout`. Put every protected route under it. |
| `/dashboard` | `routes/dashboard.tsx` | Overview from `GET /api/dashboard`: four stat tiles, an Attention card (employees without a salary, linking to `/employees?salary=without`) and recent hires and salary changes. No charts |
| `/analytics` | `routes/analytics.tsx` | Titled "Analytics". Filterable analytics (department, country, role, status, currency, basis, as-of, trend range; all in the URL). One shared currency selector (default: most populous currency); two-phase loader. Summary, distribution, group comparison and trends panels; Recharts charts render client-side only, each next to an exact-value table |
| `/employees` | `routes/employees.tsx` | Employee list with current salary, from `GET /api/salaries`. Search (`q`), status (`ACTIVE`/`INACTIVE`/`ALL`, default Active), department, country, salary with/without, sort (name, department, country, joiningDate, and effectiveDate via the sortable "Current salary" header, which shows a "since {date}" caption) and pagination live in the URL query; invalid values fall back to defaults and an out-of-range page redirects to the last page. `?add=1` opens the Add employee dialog (Country is a searchable autocomplete). While a new page loads, a `LinearProgress` bar shows over the dimmed table (no skeleton rows). Row menu: View, Edit, Set/Revise salary (both navigate to the profile with `?edit=1` / `?salary=initial|revise`), Deactivate/Reactivate. After adding, the toast offers a Set salary action |
| `/salaries` | `routes/salaries-redirect.tsx` | Redirect only: forwards to `/employees`, keeping the query string |
| `/employees/new` | `routes/employee-new-redirect.tsx` | Redirect only: to `/employees?add=1` |
| `/employees/:id` | `routes/employee-profile.tsx` | Profile with Overview and Compensation tabs (current salary, scheduled change, history). The Edit employee and Set/Revise salary dialogs are URL-driven: the header buttons (and the empty Compensation state's Set salary button) only set `?edit=1` / `?salary=initial|revise`, and the param is cleared on close and after success. The action handles status changes and JSON edit/salary saves; success toasts replace the old `?notice=`; "Employee not found" on 404 |
| `/employees/:id/edit` | `routes/employee-edit-redirect.tsx` | Redirect only: to `/employees/:id?edit=1` |

## How auth and SSR work

The browser only talks to the frontend origin. Loaders and actions run on the server, call the backend through `app/lib/api-client.ts` (forwarding the incoming `Cookie` header where needed) and relay the backend's `Set-Cookie` header back to the browser. The session is an httpOnly `session` JWT cookie issued by the backend, so no CORS or cross-origin cookie handling is needed in the default topology.

Theme: `app/theme.ts` (custom light theme). Layout: `app/components/layout/` (`AppLayout`: a sidebar-only shell, no top bar, with Dashboard / Employees / Analytics nav and the user menu with Logout at the bottom, `PageHeader` with breadcrumbs), `app/components/common/` (`ToastProvider`/`useToast` with an optional action link, `FormDialog`, `ConfirmDialog`, `EmptyState`, `Money`, `StatusChip`), `app/components/employees/` (`EmployeeFilterBar`, `EmployeeDirectoryTable`, `EmployeeFormDialog`), `app/components/salary/` (`CompensationSection`, `SalaryFormDialog`), `app/components/analytics/` (filters, stat cards, charts, tables, recent activity), `app/lib/` (`api-client`, `analytics-api`, `employees-api`, `require-user`, `salaries-api`, `salary-directory-api`, `salary-form`, `currencies`, `countries`, `format-date` for shared "Jan 15, 2020" calendar-date display). Sample salary data comes from `bun run db:seed` in the backend.
