# Salary Management

An employee compensation management and analytics app for HR teams. It replaces spreadsheets with one place to manage employees, record salary changes with full history, and see how pay is distributed across the company.

Built for 10,000 employees across about 20 countries.

**Live:** https://scintillating-spontaneity-production.up.railway.app

## What it does

- **Employees:** add, edit, deactivate and reactivate. Search by name, email or ID; filter by status, department, country and salary; sort, page and export to CSV. IDs are generated (`EMP-00001`).
- **Salaries:** base pay plus allowances, bonuses and deductions, in any of 20 currencies, with an effective date and a reason. Changes are appended, never overwritten, so history is always complete.
- **Dashboard:** headcount, departments, countries, employees without a salary, recent hires and salary changes.
- **Analytics:** pay distribution, comparison by department, country or role, and trends over time. Totals are always per currency, never mixed.
- **Access:** login with an httpOnly session cookie and two roles (`ADMIN`, `HR_MANAGER`) enforced on the backend.
- **Demo data:** one click on the dashboard (admin only) loads 10,000 employees with salary history.

Payroll and tax calculation, currency conversion and approval workflows are deliberately out of scope. See [docs/00-requirements-one-pager.md](docs/00-requirements-one-pager.md) for the reasoning.

## Tech stack

| Layer | Tech |
|---|---|
| Backend | Bun, Express 5, Prisma 7, PostgreSQL |
| Frontend | React Router v8 (SSR), MUI |
| Tests | Vitest |
| Deploy | Docker, Railway |

## Quick start (Docker)

You need Docker. `JWT_SECRET` (32+ characters) is required; there is no default, so a deployment can never run with a public signing key.

```bash
cp .env.example .env                          # set JWT_SECRET, e.g. openssl rand -hex 32
docker compose up --build
docker compose exec backend bun run db:seed   # one-time: dev admin, departments, sample employees
```

Then open http://localhost:3000 and sign in:

- Email: `admin@salary-management.local`
- Password: `ChangeMe123!` (development only)

Click **Load demo data** on the dashboard to fill the app with 10,000 employees.

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API health check | http://localhost:3001/health |
| PostgreSQL | `localhost:5432` (`postgres` / `postgres`, db `salary_management`) |

Stop with `docker compose down` (add `-v` to delete the database).

> In compose `NODE_ENV=production`, so the session cookie is `Secure`. It works on `http://localhost` in most browsers, but not over plain HTTP on other hosts.

## Run locally without Docker

```bash
docker compose up -d postgres          # database only (needs the root .env)

cd backend
cp .env.example .env                   # set JWT_SECRET
bun install
bun run db:deploy                      # apply migrations
bun run db:seed
bun run dev                            # http://localhost:3001

cd ../frontend                         # in another terminal
bun install
bun run dev                            # http://localhost:5173
```

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | backend | PostgreSQL connection string |
| `JWT_SECRET` | backend | Session signing key, 32+ characters |
| `JWT_EXPIRES_IN` | backend | Session lifetime, e.g. `1d` |
| `COOKIE_NAME` | backend | Session cookie name |
| `FRONTEND_URL` | backend | Allowed CORS origin |
| `PORT` | both | Listen port |
| `VITE_API_URL` | frontend, build time | Backend base URL, with `http(s)://` |

See `backend/.env.example` for the full list.

## Deploying to Railway

Create three services in one project and point each at its folder.

1. **Postgres:** add the Railway PostgreSQL database.
2. **backend:** Root Directory `/backend` (uses its `Dockerfile`). Set `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `COOKIE_NAME` and `FRONTEND_URL` (the frontend's public URL). Migrations run on start.
3. **frontend:** Root Directory `/frontend`. Set `VITE_API_URL` to the backend URL **including `https://`**. It is inlined at build time, so changing it needs a redeploy.

Seed the first admin with `bun run db:seed` against the Railway database, or insert a user row by hand (password is a bcrypt hash). If you add a custom domain, add it to `allowedActionOrigins` in `frontend/react-router.config.ts`; this is what stops form posts being rejected as cross-origin behind Railway's proxy.

## API overview

All routes need a session except login. Roles: `ADMIN` and `HR_MANAGER` unless noted.

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Employees | `GET/POST /api/employees`, `GET/PATCH /api/employees/:id`, `PATCH /api/employees/:id/status`, `GET /api/departments` |
| Salaries | `GET/POST /api/employees/:id/salaries`, `GET /api/employees/:id/salaries/:salaryId` |
| Salary directory | `GET /api/salaries` (current salary per employee, filters, sorting, pagination), `GET /api/salaries/export` (CSV) |
| Dashboard | `GET /api/dashboard` |
| Analytics | `GET /api/analytics/summary`, `/distribution`, `/groups`, `/trends`, `/filters` |
| Demo data | `GET /api/demo-data`, `POST /api/demo-data/seed` (`ADMIN` only, idempotent) |

Pages: `/dashboard`, `/employees`, `/employees/:id`, `/analytics`.

## Tests

```bash
cd backend && bun run typecheck && bun run test    # needs Postgres running and backend/.env
cd frontend && bun run typecheck && bun run test && bun run build
```

## Project structure

```
backend/    Express API, Prisma schema and migrations, seed scripts
frontend/   React Router app (SSR) and UI
docs/       Requirements, architecture, status, trade-offs
docs/implementation/   Per-module summaries of what was built
docker-compose.yml     Postgres, backend and frontend
```

## Design notes

- **Salary history is append-only.** "Current salary" is a query over records, not a column that gets overwritten.
- **Money is per currency.** There is no honest conversion without a rate source, so mixed totals are never shown.
- **Server-side rendering.** The frontend calls the API from route loaders and actions and relays the session cookie, so the browser only talks to the frontend origin.
- **Employee IDs come from a Postgres sequence**, so concurrent creates cannot collide.
- **Fast at 10,000 rows.** Key pages respond in well under half a second; measurements are in the trade-offs doc.

## Documentation

- [Requirements one-pager](docs/00-requirements-one-pager.md)
- [Product overview](docs/01-product-overview.md)
- [Tech stack and architecture](docs/02-tech-stack-and-architecture.md)
- [Modules and use cases](docs/03-modules-and-use-cases.md)
- [Implementation status](docs/04-implementation-status.md)
- [Trade-offs, performance and how AI was used](docs/05-tradeoffs-and-performance.md)
- [`backend/README.md`](backend/README.md), [`frontend/README.md`](frontend/README.md)

## How AI was used

Claude Code did the building, and the human set direction and approved each stage. Each feature went from brainstorm to written spec to written plan to small commits, with specs and plans kept in `docs/superpowers/`. Project rules live in `CLAUDE.md`. Details are in [docs/05-tradeoffs-and-performance.md](docs/05-tradeoffs-and-performance.md).
