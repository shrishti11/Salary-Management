# Salary Management API

## Run locally

```bash
bun install
bun run dev
```

Set `DATABASE_URL` in `.env` before using Prisma migrations. The generated starter uses PostgreSQL.

```bash
bun run prisma:migrate
bun run prisma:generate
```

## Verify

```bash
bun run typecheck
bun run test
```
