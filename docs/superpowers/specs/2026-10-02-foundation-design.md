# Foundation Design

Date: 2026-10-02
Status: Approved

## 1. Purpose

Establish the application foundation for the Employee Salary Management System before any business module (employees, salaries, analytics, import/export, audit) is built. This covers project structure, configuration, database connectivity, a minimal auth-capable schema, the Express API skeleton, the React/MUI shell, basic authentication, and the test setup needed to verify everything end-to-end.

Scope is intentionally limited to what later modules depend on (per `docs/03-modules-and-use-cases.md` §9 Module Dependencies: every module depends on Database, and most depend on Authentication). No business-domain schema (Employee, Salary, Department, AuditLog) or endpoints are built in this phase.

## 2. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Package manager / runtime | Keep Bun | Already working end-to-end (lockfiles, Dockerfiles, scripts); switching to Yarn is pure churn with no functional gain. Docs' "Yarn" predates the actual scaffold. |
| Auth strategy | Stateless JWT in httpOnly cookie | Simplest option with no session-store infra; matches "modular monolith, minimal infra" principle in docs §9/§12. |
| Frontend styling | MUI only, remove Tailwind | Tech stack doc specifies MUI; Tailwind was leftover from the React Router starter template and would create two competing styling systems. |
| Schema scope (this phase) | `User` + `Role` enum only | Employee/Salary/Department/AuditLog schemas belong to their own module sessions per docs' phased implementation priority; building them now would be speculative. |

## 3. Architecture

No change to the documented modular monolith (`docs/02-tech-stack-and-architecture.md` §4). Backend adds the shared scaffolding (`config/`, `lib/`, `middleware/`) plus one real module (`modules/auth/`) — other module directories (`employees/`, `salaries/`, etc.) are not created until their own session, avoiding empty placeholder folders. Frontend adds an `AppLayout` route shell wrapping protected pages.

```text
backend/src/
├── config/
│   └── env.ts              (extended)
├── lib/
│   ├── prisma.ts           (new)
│   ├── password.ts         (new)
│   └── jwt.ts              (new)
├── middleware/
│   ├── error.middleware.ts (new)
│   └── auth.middleware.ts  (new)
├── modules/
│   └── auth/
│       ├── auth.schema.ts
│       ├── auth.service.ts
│       ├── auth.controller.ts
│       └── auth.routes.ts
├── app.ts                  (wire new middleware/routes)
└── server.ts
```

```text
frontend/app/
├── routes/
│   ├── login.tsx            (new)
│   └── dashboard.tsx         (new placeholder, protected)
├── components/
│   └── layout/
│       ├── AppLayout.tsx    (new)
│       └── PageHeader.tsx   (new)
├── lib/
│   └── api-client.ts        (new — fetch wrapper, credentials: 'include')
├── root.tsx                 (Tailwind removed)
└── routes.ts                (updated route tree)
```

## 4. Database Schema (this phase)

```prisma
enum Role {
  ADMIN
  HR_MANAGER
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  name         String
  role         Role     @default(HR_MANAGER)
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

A seed script (`backend/prisma/seed.ts`) creates one deterministic dev admin user (fixed email/password, bcrypt-hashed) so login can be exercised locally and in tests without manual setup.

`backend/.env` is corrected to the real docker-compose credentials (`postgresql://postgres:postgres@localhost:5432/salary_management?schema=public`) instead of the placeholder `mydb` connection string. `PORT` default is standardized to `3001` across `.env.example`, docs, and README to match docker-compose and the existing health-check instructions.

## 5. Backend Design

### New dependencies
`bcryptjs`, `jsonwebtoken`, `cookie-parser` (+ `@types/*` for the latter two; bcryptjs ships its own types). No session store, no additional infrastructure.

### Config (`config/env.ts`)
Extend the existing zod-validated env with `JWT_SECRET` (required, min length enforced), `JWT_EXPIRES_IN` (default `"1d"`), `COOKIE_NAME` (default `"session"`), `FRONTEND_URL` (default `"http://localhost:3000"`, used for CORS origin).

### `lib/prisma.ts`
Standard singleton pattern (cache on `globalThis` in development to survive hot reload, instantiate fresh in production).

### `lib/password.ts`
`hashPassword(plain)`, `verifyPassword(plain, hash)` wrapping bcryptjs.

### `lib/jwt.ts`
`signToken(payload)`, `verifyToken(token)` wrapping jsonwebtoken with the configured secret/expiry. Payload: `{ sub: userId, role }`.

### `middleware/error.middleware.ts`
`AppError` class (`statusCode`, `message`, optional `code`). Centralized error-handling middleware catches `AppError` and unexpected errors, returns a consistent shape: `{ error: { message, code? } }`. Stack traces logged server-side only, never returned in production. The existing 404 handler moves here as `notFoundHandler`.

### `middleware/auth.middleware.ts`
- `requireAuth`: reads JWT from the cookie (`COOKIE_NAME`), verifies it, loads the user's `id`/`role` onto `req.user`, or calls `next(new AppError(401, "Unauthorized"))`.
- `requireRole(...roles)`: after `requireAuth`, checks `req.user.role` is in the allowed set, else `403`.

### `modules/auth/`
- `auth.schema.ts`: zod `loginSchema` (`email`, `password`).
- `auth.service.ts`: `login(email, password)` — looks up user by email, verifies `isActive`, verifies password hash, returns signed JWT + user (without `passwordHash`). Throws `AppError(401, "Invalid credentials")` on any failure (no distinction between "no such user" and "wrong password", to avoid user enumeration).
- `auth.controller.ts`: `POST /login` sets the httpOnly cookie and returns the user; `POST /logout` clears the cookie; `GET /me` returns the current user from `req.user` (requires `requireAuth`).
- `auth.routes.ts`: mounts the above at `/api/auth`.

### `app.ts`
Add `cookie-parser`, mount `/api/auth` routes, replace the inline 404 handler with `notFoundHandler`, add the centralized error handler as the last middleware. CORS updated to `{ origin: env.FRONTEND_URL, credentials: true }` (replacing the current wide-open `cors()`).

## 6. Frontend Design

- Remove `tailwindcss`/`@tailwindcss/vite` from `package.json` and `vite.config.ts`; strip Tailwind utility classes from `app.css` and `welcome.tsx` (or delete the welcome boilerplate route since it's being replaced by real routes).
- `components/layout/AppLayout.tsx`: MUI `AppBar` + side navigation (`Dashboard`, `Employees`, `Salaries`, `Analytics` — links present but their target routes are placeholders until those modules exist), wraps an `<Outlet />` for nested protected routes.
- `routes/login.tsx`: MUI form, React Hook Form + Zod resolver, calls `POST /api/auth/login` via `lib/api-client.ts`, redirects to `/dashboard` on success, shows inline error on failure.
- `routes/dashboard.tsx`: placeholder page behind the auth guard, proves the protected-route flow works; real dashboard content is a future module.
- Route protection: a loader on the `AppLayout` route (or a parent layout route) calls `GET /api/auth/me`, forwarding the incoming request's cookie header (SSR mode runs loaders server-side), redirects to `/login` on `401`.
- `lib/api-client.ts`: thin fetch wrapper defaulting `credentials: 'include'` and a configurable base URL (`VITE_API_URL`, default `http://localhost:3001`).

### Cross-origin cookie note
Dev frontend (`:3000`) and backend (`:3001`) are different origins but the same site (`localhost`), so `SameSite=Lax` cookies are sent on cross-origin fetches between them — no `SameSite=None` needed locally. This is documented as a constraint: if frontend and backend are ever deployed to genuinely different registrable domains in production, the cookie needs `SameSite=None; Secure` and CORS must list the exact production origin.

## 7. Error Handling

- Backend: all errors flow through the centralized handler → `{ error: { message, code? } }` with an appropriate status code. No stack leakage outside development logs.
- Frontend: existing RR7 `ErrorBoundary` in `root.tsx` continues to handle route-level errors. Form errors surface inline via React Hook Form. Failed `/api/auth/me` loader calls are treated as "not authenticated", not a hard error.

## 8. Testing

**Backend (vitest + supertest):**
- `GET /health` (existing, keep).
- `POST /api/auth/login` — success (seeded user), wrong password, unknown email, inactive user.
- `POST /api/auth/logout` — cookie cleared.
- `GET /api/auth/me` — authenticated vs. unauthenticated.
- `requireRole` — 403 when role doesn't match.

**Frontend (vitest + React Testing Library):**
- Root layout renders without crashing.
- Login form: validation errors for empty/invalid input.
- Unauthenticated access to a protected route redirects to `/login` (mock the API call).

## 9. Out of Scope

Employee, Salary, Department, Analytics, Import/Export, Audit modules and their schemas/endpoints/UI — all deferred to their own sessions per the phased priority in `docs/03-modules-and-use-cases.md` §10. Admin user-management UI (creating/deactivating users) is also deferred; the seed script is the only way to create a user in this phase.

## 10. Documentation Follow-up

After implementation: update `README.md` (corrected PORT, env setup, how to run both apps + seed), `backend/README.md`, and create `docs/implementation/2026-10-02-foundation-summary.md` per the `CLAUDE.md` module-completion convention, covering what was built, key decisions, APIs added, schema changes, tests, and remaining work for the next session (Phase 1: Employee module).
