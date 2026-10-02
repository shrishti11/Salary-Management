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
| `/dashboard` | `routes/dashboard.tsx` | Placeholder showing the signed-in user |
| `/employees` | `routes/employees.tsx` | Directory. Search, filters, sort and pagination live in the URL query (invalid values fall back to defaults; an out-of-range page redirects to the last page); sample data comes from `bun run db:seed` in the backend |
| `/salaries` | `routes/salaries.tsx` | Salary directory: current gross/net/currency/effective date per employee (a "Scheduled" chip when a future record exists, "No salary" when none). Search, department, country, status (Active by default), salary presence, sort and pagination live in the URL query; invalid values fall back to defaults and an out-of-range page redirects to the last page |
| `/employees/new` | `routes/employee-new.tsx` | Create form; action receives a JSON submit, redirects to the profile with `?notice=created`; 409 shows a field error |
| `/employees/:id` | `routes/employee-profile.tsx` | Profile with compensation section (current salary, scheduled change, history, set/revise dialog); the action handles the activate/deactivate form post and the JSON salary save; `?notice=` drives a success toast; "Employee not found" on 404 |
| `/employees/:id/edit` | `routes/employee-edit.tsx` | Edit form (employee ID read-only); redirects with `?notice=updated` |

## How auth and SSR work

The browser only talks to the frontend origin. Loaders and actions run on the server, call the backend through `app/lib/api-client.ts` (forwarding the incoming `Cookie` header where needed) and relay the backend's `Set-Cookie` header back to the browser. The session is an httpOnly `session` JWT cookie issued by the backend, so no CORS or cross-origin cookie handling is needed in the default topology.

Layout: `app/components/layout/` (`AppLayout`, `PageHeader`), `app/components/salary/` (`CompensationSection`, `SalaryFormDialog`, `SalaryDirectoryFilters`, `SalaryDirectoryTable`), `app/lib/` (`api-client`, `require-user`, `salaries-api`, `salary-directory-api`, `salary-form`, `currencies`). Sample salary data comes from `bun run db:seed` in the backend.
