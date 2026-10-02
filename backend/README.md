# Salary Management API

Express 5 + Prisma 7 + PostgreSQL, run with Bun/tsx.

## Run locally

```bash
cp .env.example .env     # set JWT_SECRET to 32+ random characters
bun install
bun run db:deploy        # prisma migrate deploy
bun run db:seed          # dev admin: admin@salary-management.local / ChangeMe123!
bun run dev              # http://localhost:3001
```

## Scripts

| Script | Purpose |
|---|---|
| `dev` / `start` | Run the API (`tsx watch` / `tsx`) |
| `typecheck` / `test` | `tsc --noEmit` / Vitest (tests hit the local Postgres and need `.env`) |
| `prisma:generate` | Generate the client into `generated/prisma` (gitignored; generated in the Docker build) |
| `prisma:migrate` | `prisma migrate dev` (create/apply migrations in development) |
| `db:deploy` | `prisma migrate deploy` (used by the Docker CMD) |
| `db:seed` | Upsert the dev admin user (idempotent) |

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | required | Postgres connection string |
| `PORT` | `3001` | |
| `JWT_SECRET` | required | At least 32 characters |
| `JWT_EXPIRES_IN` | `1d` | JWT lifetime |
| `COOKIE_NAME` | `session` | Name of the httpOnly session cookie |
| `FRONTEND_URL` | `http://localhost:3000` | CORS allowed origin (credentials enabled) |

`src/config/env.ts` validates these with Zod and loads `.env` itself (guarded `process.loadEnvFile`) because tsx and vitest do not.

## API

- `GET /health` -> `{"status":"ok"}`
- `POST /api/auth/login` `{email, password}` -> sets the session cookie; 400 on invalid body, 401 on bad credentials
- `POST /api/auth/logout` -> clears the cookie
- `GET /api/auth/me` -> current user (requires cookie); 401 if missing/invalid/deactivated

Errors use `{ "error": { "message", "code?" } }`; `ZodError` maps to 400 `VALIDATION_ERROR`.

## Prisma 7 notes

- Config lives in `prisma7.config.ts` (datasource URL, migrations path); the schema has no `url`.
- The client uses the `@prisma/adapter-pg` driver adapter (`src/lib/prisma.ts`) and is generated to `generated/prisma` (import `../generated/prisma/client.ts`).
- Prisma 7 does not auto-load `.env`; the config and seed load it explicitly.
