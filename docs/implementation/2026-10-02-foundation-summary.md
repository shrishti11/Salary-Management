# Foundation Implementation Summary (2026-10-02)

Branch: `feature/foundation`. Spec: `docs/superpowers/specs/2026-10-02-foundation-design.md`. Plan: `docs/superpowers/plans/2026-10-02-foundation.md`.

## Original task

Build the application foundation in small steps: (1) project structure, config and scripts; (2) Postgres + Prisma + migrations + seed; (3) Express API skeleton with validation, error handling and health check; (4) React MUI shell with layout, navigation and reusable components; (5) authentication: login, logout, protected routes, role-based access; (6) shared data models; (7) tests plus end-to-end verification.

## What was completed

| Step | Result |
|---|---|
| 1 Structure/config/scripts | Zod-validated env (`backend/src/config/env.ts`), standardized ports (API 3001, frontend dev 5173 / Docker 3000), scripts, `.env.example`, Docker Compose (postgres, backend, frontend), READMEs |
| 2 Postgres/Prisma/migrations/seed | Prisma 7 with driver adapter, `User`/`Role` schema, migration `20261002103833_add_user_model`, idempotent `db:seed` (dev admin) |
| 3 Express skeleton | `app.ts` (helmet, cors, json, cookie-parser), `/health`, `AppError` + central `errorHandler`/`notFoundHandler`, ZodError -> 400 |
| 4 React MUI shell | MUI-only (Tailwind removed), `AppLayout` (AppBar, drawer nav, logout), `PageHeader`, error boundary, placeholder dashboard |
| 5 Auth | Login/logout/me endpoints, `requireAuth` + `requireRole` middleware, frontend login form, shared authenticated layout loader, logout route |
| 6 Shared data models | **Deliberately scoped to `User` + `Role` only** per the approved spec. Department/Employee/Salary models are NOT built; they belong to the Employee module |
| 7 Tests + e2e | 30 backend + 18 frontend tests; real end-to-end checks (see Verification) |

## Key decisions

- **JWT in an httpOnly cookie** (`session`), issued by the backend; no tokens in JS-accessible storage.
- **SSR server-side API calls:** React Router framework mode loaders/actions call the backend and relay `Set-Cookie`; browser only talks to the frontend origin, so CORS/SameSite-cross-site concerns do not arise in the default topology.
- **Shared auth layout loader** (`routes/authenticated.tsx`): all protected routes nest under it; child routes cannot forget the guard. Route id exported as a shared constant that fails loudly if missing.
- **Logout added beyond the plan** (UC-AUTH-02): `/logout` route + AppBar button.
- Bun kept (package manager/scripts); API runs under `tsx`. Tailwind removed in favor of MUI only.
- Minimal schema (User + Role). ZodError -> 400 `{error:{message:"Validation failed",code:"VALIDATION_ERROR"}}` centrally; `errorHandler` has a `headersSent` guard.
- **Prisma 7 quirks:** no `url` in the schema (config is `prisma7.config.ts`), driver adapter `@prisma/adapter-pg`, client generated to `generated/prisma` (gitignored, generated in the Docker build), `.env` is not auto-loaded so `env.ts`, `prisma7.config.ts` and `seed.ts` use a guarded `process.loadEnvFile`. The `prisma.seed` key in package.json is likely ignored (script `db:seed` is what is used).
- `/api/auth/me` rejects deactivated users (clears cookie, 401) so the frontend guard locks them out.
- **Docker:** backend CMD runs `bun run db:deploy` (prisma migrate deploy) then starts; seeding is manual (`docker compose exec backend bun run db:seed`). Compose requires `JWT_SECRET` (no default; see Final review fixes). Frontend `VITE_API_URL` is a build arg (`http://backend:3001` in compose) because it is inlined at build time.

## APIs

- `GET /health` -> `{"status":"ok"}`
- `POST /api/auth/login` `{email,password}` -> 200 + `Set-Cookie: session`; 400 invalid body; 401 bad credentials
- `POST /api/auth/logout` -> clears cookie
- `GET /api/auth/me` -> `{user:{id,email,name,role}}`; 401 otherwise

Frontend routes: `/` (redirect to `/dashboard`), `/login`, `/logout`, `/dashboard` (protected).

## Database changes

`User` table (id UUID, email unique, passwordHash, name, role, isActive, timestamps) and `Role` enum (`ADMIN`, `HR_MANAGER`). Migration: `backend/prisma/migrations/20261002103833_add_user_model`.

## Tests

Backend (8 files, 30 tests): `app.test.ts`, `config/env.test.ts`, `lib/jwt.test.ts`, `lib/password.test.ts`, `middleware/auth.middleware.test.ts`, `middleware/error.middleware.test.ts`, `modules/auth/auth.routes.test.ts`, `modules/auth/auth.service.test.ts`.
Frontend (9 files, 18 tests): `components/layout/AppLayout.test.tsx`, `lib/api-client.test.ts`, `lib/require-user.test.ts`, `routes.test.ts`, `routes/authenticated.test.tsx`, `routes/dashboard.test.tsx`, `routes/login.action.test.ts`, `routes/login.test.tsx`, `routes/logout.test.ts`.

## Verification (Task 12)

Run against both `docker compose up --build` (fresh volume: migration applied on start, manual seed) and local processes (postgres in Docker, backend `bun run dev`, frontend `bun run dev`) with curl: backend `/health`, login good (200) / bad (401) / bad body (400), `/me` with and without cookie; frontend `GET /` -> 302 `/dashboard`, `/dashboard` anon -> 302 `/login`, `/login` 200, form POST to `/login.data` relays the `session` cookie, authenticated `/dashboard` renders "Signed in as Dev Admin (ADMIN)" (confirms the shared route id works), `/logout.data` clears the cookie and `/dashboard` redirects to `/login` again. No real browser was used (no screenshots, no JS-hydrated form submission). Typecheck/tests/build clean for both apps.

## Final review fixes

- Login form now has `method="post"`, so a pre-hydration/no-JS submit POSTs to the route `action` instead of putting the password in a GET query string (RTL test added).
- `errorHandler` maps body-parser client errors (malformed JSON, oversized body; numeric 4xx `status`/`statusCode`) to 400 `{error:{message:"Invalid request body",code:"BAD_REQUEST"}}` without logging or echoing parser details (tests in `error.middleware.test.ts` and `auth.routes.test.ts`).
- `docker-compose.yml` now **requires** `JWT_SECRET` (`${JWT_SECRET:?...}`), so no deployment can silently run with a public signing key. Set it in a git-ignored root `.env` (copy `.env.example`, which has an empty placeholder) or inline. Compose validates the whole file, so even `docker compose up -d postgres` needs it set.
- Login/logout session cookie attributes (HttpOnly, SameSite=Lax, expired-on-logout) are pinned in tests.

## Known limitations and deferred items

**Security / auth**
- `requireAuth` is stateless: a deactivated user's still-valid JWT is honored on any non-`/me` route until expiry (1d). Add an `isActive` check when admin user management / Phase 4 lands.
- Session cookie has no `maxAge` (browser-session cookie, decoupled from JWT TTL). `verifyToken` does not typeof-check `sub`/`role` or pin HS256. Login has a timing side-channel for unknown users; email is not lowercased/trimmed.
- In production mode the cookie is `Secure`: plain-HTTP access on non-localhost hosts (and possibly Safari on localhost) will not keep the session. For a cross-domain deployment (separate frontend/API hosts) revisit SameSite (Lax assumes same site) and CORS `FRONTEND_URL`; moot in the default SSR relay topology.
- No admin user-management UI; the only user is the seed admin.

**Infra / tests**
- Backend tests (only) depend on a local `backend/.env` / running Postgres (no CI env yet); frontend tests stub `fetch` and need neither; add vitest `setupFiles`/test env before CI. Test users may orphan if a run is killed (use upsert/pre-clean).
- `.env` loading duplicated in `prisma7.config.ts` and `seed.ts` (plus `env.ts`); extract if more appear.
- `VITE_API_URL` is baked at build time; changing the API URL needs a frontend rebuild.
- Compose seed is manual; dev secret default in `docker-compose.yml` must be overridden for real use.

**Code minors (backend)**
- `jwt.ts` uses `expiresIn as any` (use `SignOptions["expiresIn"]`); role typed `string` not the Prisma `Role` enum; no expired/wrong-secret token tests; weak cookie-attribute assertions in route tests; test gaps (non-string email, passwordHash absent from responses, stale-user `/me`); `AppError` lacks `this.name`.

**Code minors (frontend)**
- `apiFetch` spreads `init.headers` (plain objects only) and forces `Content-Type: application/json` (breaks future FormData); an api-client test depends on `VITE_API_URL` being unset.
- Login action maps every non-ok to "Invalid credentials" (5xx misreported) and a network failure throws to the error boundary; `requireUser` redirects on any non-ok incl. 5xx (consider 401/403 only); logout action does not handle backend fetch failure; redundant `z.string().min(1).email()` (use `z.email()`).
- `root.tsx` ErrorBoundary `paddingTop` is overridden by `padding` (swap order). `AppLayout`: backtick computed key in `sx`, hard-coded drawer width/not responsive, nav landmark aria/active state, tests check 2 of 4 links and not the role, `AuthUser` type duplicated.
- `GET /` redirects to `/dashboard` (then `/login` if signed out), not directly to `/login`.

## Next session should work on

**Phase 1 per `docs/03-modules-and-use-cases.md`: Employee module, then Salary.**

1. Plan first (CLAUDE.md: propose plan, wait for approval). Re-read the Employee sections of `docs/03-modules-and-use-cases.md` and `docs/02-tech-stack-and-architecture.md`.
2. Schema: add `Department` and `Employee` to `backend/prisma/schema.prisma` (unique employee id/email, FK to department, Decimal for money later). Create a migration with `bun run prisma:migrate` (name it e.g. `add_employee_department`); extend `db:seed` with a few departments/employees (keep it idempotent).
3. Backend module `backend/src/modules/employees/` with `employee.routes.ts`, `employee.controller.ts`, `employee.service.ts`, `employee.schema.ts` (mirror `modules/auth`). Endpoints: create, get by id, update, list with search/filter (department, status)/pagination, behind `requireAuth` (use `requireRole` where needed). Mount in `app.ts` under `/api/employees`.
4. Conventions: throw `AppError` for expected failures; validate input with zod (`.parse` -> ZodError becomes 400 automatically); consistent `{error:{message,code?}}` responses; import with `.ts` extensions; tests with Vitest + Supertest against local Postgres using unique emails/ids per test and cleanup.
5. Frontend: nest new routes under the `routes/authenticated.tsx` layout in `app/routes.ts` (employee directory with search/filter/pagination, then profile and create/edit forms); loaders call the API through `apiFetch` forwarding the `cookie` header (see `lib/require-user.ts`); add nav entries to `AppLayout`; reuse `PageHeader`; React Hook Form + Zod for forms; RTL tests per route.
6. Afterwards: Salary records/revisions/history, then update `docs/04-implementation-status.md` and add a new summary in `docs/implementation/`.
