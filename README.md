# Salary Management

Employee Compensation Management and Analytics System. Product and architecture docs live in `docs/`; progress is tracked in [docs/04-implementation-status.md](docs/04-implementation-status.md).

Stack: Bun, Express 5 + Prisma 7 + PostgreSQL (backend), React Router v8 (SSR) + MUI (frontend).

## Ports

| Service | Port |
|---|---|
| Backend API | 3001 |
| Frontend (dev server) | 5173 |
| Frontend (Docker / `bun run start`) | 3000 |
| PostgreSQL | 5432 |

## Run with Docker

`JWT_SECRET` (32+ chars) is **required**; compose refuses to start without it. Put it in a root `.env` file (git-ignored; `docker compose` reads it automatically):

```bash
cp .env.example .env                          # then set JWT_SECRET, e.g. the output of: openssl rand -hex 32
docker compose up --build
docker compose exec backend bun run db:seed   # one-time: dev admin + sample departments and employees
```

The backend applies pending migrations on start. Seeding is manual so it never runs automatically in a production-like container.

- Frontend: `http://localhost:3000`
- API health check: `http://localhost:3001/health`
- PostgreSQL: `localhost:5432` (`postgres` / `postgres`, database `salary_management`)

There is deliberately no default `JWT_SECRET`, so a deployment can never run with a publicly known signing key. Alternatively pass it inline: `JWT_SECRET=$(openssl rand -hex 32) docker compose up --build`. Stop with `docker compose down` (add `-v` to delete the database volume).

Note: in compose `NODE_ENV=production`, so the session cookie is `Secure`. Browsers accept it on `http://localhost`, but not over plain HTTP on other hosts/IPs (and Safari may reject it even on localhost).

## Features and API

- Auth: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- Employees (ADMIN and HR_MANAGER): `GET/POST /api/employees`, `GET/PATCH /api/employees/:id`, `PATCH /api/employees/:id/status`; `GET /api/departments`
- UI routes: `/employees` (directory), `/employees/new`, `/employees/:id` (profile, activate/deactivate), `/employees/:id/edit`

Details: [`backend/README.md`](backend/README.md), [`frontend/README.md`](frontend/README.md), [`docs/implementation/`](docs/implementation/).

## Run locally without Docker

```bash
docker compose up -d postgres          # database only (needs the root .env from above: compose validates JWT_SECRET for the whole file)

cd backend
cp .env.example .env                   # then set JWT_SECRET (32+ chars)
bun install
bun run db:deploy                      # apply migrations
bun run db:seed                        # dev admin + 6 departments + 5 sample employees
bun run dev                            # http://localhost:3001

cd ../frontend                         # in another terminal
bun install
bun run dev                            # http://localhost:5173
```

## Seeded admin (development only)

`admin@salary-management.local` / `ChangeMe123!` (name "Dev Admin", role ADMIN).

## Environment variables

Backend (`backend/.env`, see `backend/.env.example` and `backend/README.md`): `DATABASE_URL`, `PORT`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `COOKIE_NAME`, `FRONTEND_URL`.
Frontend: `VITE_API_URL` (build-time, default `http://localhost:3001`; `http://backend:3001` in compose).

## Authentication topology

The frontend renders on the server and calls the API server-side from route loaders/actions, relaying the backend's `Set-Cookie` header. The browser only talks to the frontend origin, so no CORS or cross-origin cookie setup is needed in this topology. CORS (`FRONTEND_URL`) is still configured on the API for direct cross-origin clients.

## Tests

```bash
cd backend && bun run typecheck && bun run test    # needs Postgres running and backend/.env
cd frontend && bun run typecheck && bun run test && bun run build
```

See also `backend/README.md`, `frontend/README.md`.
