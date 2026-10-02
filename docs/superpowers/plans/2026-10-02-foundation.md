# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the application foundation (config, DB connectivity, minimal auth schema, Express API skeleton, React/MUI shell, JWT auth, tests) so later business modules (Employee, Salary, Analytics, Import/Export, Audit) can be built on stable ground.

**Architecture:** Modular monolith per `docs/02-tech-stack-and-architecture.md`. Backend: Express + Prisma 7 (driver-adapter mode) + Zod, one real module (`auth`) plus shared `config/lib/middleware`. Frontend: React Router v7 (SSR/framework mode) + MUI only, an `AppLayout` shell wrapping protected routes, auth state resolved server-side via loaders calling the backend.

**Tech Stack:** Bun (runtime/package manager), Express 5, Prisma 7 (`@prisma/adapter-pg`, `pg`), Zod, bcryptjs, jsonwebtoken, cookie-parser, Vitest, Supertest, React Router v7, MUI, React Hook Form, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-02-foundation-design.md`

## Global Constraints

- Keep Bun as package manager/runtime for both apps — do not introduce Yarn/npm.
- MUI only on the frontend — no Tailwind.
- Auth is stateless JWT in an httpOnly cookie — no session-store table.
- Schema this phase: `User` + `Role` enum only — no Employee/Salary/Department/AuditLog models.
- CORS: explicit origin + `credentials: true` — never a wide-open `cors()`.
- No stack traces or secrets in API error responses, ever.
- Every new piece of logic (password hashing, JWT signing, middleware, auth service) ships with a Vitest test in the same task.

---

## Task 1: Backend environment config

**Files:**
- Modify: `backend/src/config/env.ts`
- Modify: `backend/.env`
- Modify: `backend/.env.example`
- Test: `backend/src/config/env.test.ts`

**Interfaces:**
- Produces: `env` object with shape `{ NODE_ENV, PORT, DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, COOKIE_NAME, FRONTEND_URL }`, used by every later backend task.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/config/env.test.ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";

const REQUIRED_ENV = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/salary_management?schema=public",
  JWT_SECRET: "a".repeat(32),
};

describe("env config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("applies defaults when optional vars are missing", async () => {
    process.env.DATABASE_URL = REQUIRED_ENV.DATABASE_URL;
    process.env.JWT_SECRET = REQUIRED_ENV.JWT_SECRET;
    delete process.env.PORT;
    delete process.env.JWT_EXPIRES_IN;
    delete process.env.COOKIE_NAME;
    delete process.env.FRONTEND_URL;
    delete process.env.NODE_ENV;

    const { loadEnv } = await import("./env");
    const env = loadEnv();

    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe("development");
    expect(env.JWT_EXPIRES_IN).toBe("1d");
    expect(env.COOKIE_NAME).toBe("session");
    expect(env.FRONTEND_URL).toBe("http://localhost:3000");
  });

  it("throws when JWT_SECRET is missing", async () => {
    process.env.DATABASE_URL = REQUIRED_ENV.DATABASE_URL;
    delete process.env.JWT_SECRET;

    const { loadEnv } = await import("./env");

    expect(() => loadEnv()).toThrow();
  });

  it("throws when JWT_SECRET is too short", async () => {
    process.env.DATABASE_URL = REQUIRED_ENV.DATABASE_URL;
    process.env.JWT_SECRET = "short";

    const { loadEnv } = await import("./env");

    expect(() => loadEnv()).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun run test src/config/env.test.ts`
Expected: FAIL — `loadEnv` is not exported (current `env.ts` only exports a pre-parsed `env` constant, no factory function, no new fields).

- [ ] **Step 3: Write minimal implementation**

```typescript
// backend/src/config/env.ts
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("1d"),
  COOKIE_NAME: z.string().default("session"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
});

export type Env = z.infer<typeof environmentSchema>;

export function loadEnv(): Env {
  return environmentSchema.parse(process.env);
}

export const env = loadEnv();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun run test src/config/env.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Fix `.env` and `.env.example`, standardize PORT**

```bash
# backend/.env.example
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/salary_management?schema=public"
PORT=3001
JWT_SECRET="replace-with-a-random-32-character-minimum-secret"
JWT_EXPIRES_IN="1d"
COOKIE_NAME="session"
FRONTEND_URL="http://localhost:3000"
```

```bash
# backend/.env (matches docker-compose credentials, real dev secret)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/salary_management?schema=public"
PORT=3001
JWT_SECRET="dev-only-secret-change-me-32chars-min"
JWT_EXPIRES_IN="1d"
COOKIE_NAME="session"
FRONTEND_URL="http://localhost:3000"
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/config/env.ts backend/src/config/env.test.ts backend/.env.example backend/.env
git commit -m "feat(backend): add validated env config with auth settings"
```

---

## Task 2: Prisma schema, driver adapter, migration, seed

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/package.json` (new deps + `db:seed` script + `prisma.seed` config)
- Create: `backend/prisma/seed.ts`

**Interfaces:**
- Produces: `User` model (`id, email, passwordHash, name, role, isActive, createdAt, updatedAt`), `Role` enum (`ADMIN`, `HR_MANAGER`), generated Prisma client at `backend/generated/prisma`.
- Consumes: `DATABASE_URL` from Task 1's `.env`.

- [ ] **Step 1: Add driver adapter dependencies**

```bash
cd backend && bun add @prisma/adapter-pg pg && bun add -D @types/pg
```

(Prisma 7's `prisma-client` generator requires an explicit driver adapter — confirmed in the generated client's own docs comment at `backend/generated/prisma/internal/class.ts`. Without this, `new PrismaClient()` throws at runtime.)

- [ ] **Step 2: Write the schema**

```prisma
// backend/prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

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

- [ ] **Step 3: Generate client and create the migration**

Run: `cd backend && bun run prisma:generate`
Expected: regenerates `backend/generated/prisma` with `User`/`Role` types.

Run: `cd backend && bunx prisma migrate dev --name add_user_model`
Expected: creates `backend/prisma/migrations/<timestamp>_add_user_model/migration.sql`, applies it to the local Postgres (requires `docker compose up -d postgres` running first), prints "Your database is now in sync with your schema."

- [ ] **Step 4: Add bcryptjs (needed by the seed script) and write the seed script**

```bash
cd backend && bun add bcryptjs && bun add -D @types/bcryptjs
```

```typescript
// backend/prisma/seed.ts
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../generated/prisma/client.ts";

const DEV_ADMIN_EMAIL = "admin@salary-management.local";
const DEV_ADMIN_PASSWORD = "ChangeMe123!";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const passwordHash = await bcrypt.hash(DEV_ADMIN_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: DEV_ADMIN_EMAIL },
    update: {},
    create: {
      email: DEV_ADMIN_EMAIL,
      passwordHash,
      name: "Dev Admin",
      role: "ADMIN",
    },
  });

  console.log(`Seeded admin user: ${user.email} (password: ${DEV_ADMIN_PASSWORD})`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 5: Wire up the seed script in `package.json`**

```json
{
  "scripts": {
    "db:seed": "tsx prisma/seed.ts"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

(Add these alongside the existing `scripts` block and as a new top-level `prisma` key — don't remove existing scripts.)

- [ ] **Step 6: Run and verify the seed**

Run: `cd backend && bun run db:seed`
Expected: prints `Seeded admin user: admin@salary-management.local (password: ChangeMe123!)`. Running it twice is safe (upsert) and prints the same line both times.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma backend/package.json backend/bun.lock
git commit -m "feat(backend): add User/Role schema, migration, and seed script"
```

---

## Task 3: Shared libs — Prisma client, password hashing, JWT

**Files:**
- Create: `backend/src/lib/prisma.ts`
- Create: `backend/src/lib/password.ts`
- Create: `backend/src/lib/password.test.ts`
- Create: `backend/src/lib/jwt.ts`
- Create: `backend/src/lib/jwt.test.ts`

**Interfaces:**
- Consumes: `env.DATABASE_URL`, `env.JWT_SECRET`, `env.JWT_EXPIRES_IN` from Task 1.
- Produces:
  - `prisma: PrismaClient` (default export from `lib/prisma.ts`)
  - `hashPassword(plain: string): Promise<string>`, `verifyPassword(plain: string, hash: string): Promise<boolean>`
  - `signToken(payload: { sub: string; role: string }): string`, `verifyToken(token: string): { sub: string; role: string }` (throws on invalid/expired token)

- [ ] **Step 1: `lib/prisma.ts` (singleton, no test — trivial wiring)**

```typescript
// backend/src/lib/prisma.ts
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../generated/prisma/client.ts";
import { env } from "../config/env.ts";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 2: Write failing tests for `lib/password.ts`**

```typescript
// backend/src/lib/password.test.ts
import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("produces a hash different from the plain text", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(hash).not.toBe("correct-horse-battery-staple");
  });

  it("verifies a correct password against its hash", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    await expect(verifyPassword("correct-horse-battery-staple", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd backend && bun run test src/lib/password.test.ts`
Expected: FAIL — `./password` does not exist.

- [ ] **Step 4: Implement `lib/password.ts`**

```typescript
// backend/src/lib/password.ts
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && bun run test src/lib/password.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Write failing tests for `lib/jwt.ts`**

```typescript
// backend/src/lib/jwt.test.ts
import { describe, expect, it } from "vitest";

import { signToken, verifyToken } from "./jwt";

describe("jwt", () => {
  it("round-trips a payload through sign and verify", () => {
    const token = signToken({ sub: "user-123", role: "ADMIN" });
    const decoded = verifyToken(token);

    expect(decoded.sub).toBe("user-123");
    expect(decoded.role).toBe("ADMIN");
  });

  it("throws when verifying a tampered token", () => {
    const token = signToken({ sub: "user-123", role: "ADMIN" });
    const tampered = `${token}tampered`;

    expect(() => verifyToken(tampered)).toThrow();
  });

  it("throws when verifying garbage input", () => {
    expect(() => verifyToken("not-a-jwt")).toThrow();
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `cd backend && bun run test src/lib/jwt.test.ts`
Expected: FAIL — `./jwt` does not exist.

- [ ] **Step 8: Add jsonwebtoken and implement `lib/jwt.ts`**

```bash
cd backend && bun add jsonwebtoken && bun add -D @types/jsonwebtoken
```

```typescript
// backend/src/lib/jwt.ts
import jwt from "jsonwebtoken";

import { env } from "../config/env.ts";

export interface TokenPayload {
  sub: string;
  role: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);

  if (typeof decoded === "string" || !("sub" in decoded) || !("role" in decoded)) {
    throw new Error("Invalid token payload");
  }

  return { sub: decoded.sub as string, role: decoded.role as string };
}
```

- [ ] **Step 9: Run to verify it passes**

Run: `cd backend && bun run test src/lib/jwt.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 10: Commit**

```bash
git add backend/src/lib backend/package.json backend/bun.lock
git commit -m "feat(backend): add prisma client, password hashing, and jwt libs"
```

---

## Task 4: Error-handling middleware

**Files:**
- Create: `backend/src/middleware/error.middleware.ts`
- Create: `backend/src/middleware/error.middleware.test.ts`

**Interfaces:**
- Produces: `AppError` class (`constructor(statusCode: number, message: string, code?: string)`), `errorHandler` (Express error middleware), `notFoundHandler` (Express middleware).
- Consumed by: Task 6 (auth controller throws `AppError`), Task 7 (app.ts wiring).

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/middleware/error.middleware.test.ts
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { AppError, errorHandler, notFoundHandler } from "./error.middleware";

function buildTestApp() {
  const app = express();

  app.get("/boom", () => {
    throw new AppError(422, "Invalid input", "INVALID_INPUT");
  });

  app.get("/crash", () => {
    throw new Error("unexpected failure");
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

describe("error middleware", () => {
  it("returns the AppError's status, message, and code", async () => {
    const response = await request(buildTestApp()).get("/boom");

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ error: { message: "Invalid input", code: "INVALID_INPUT" } });
  });

  it("returns 500 with a generic message for unexpected errors", async () => {
    const response = await request(buildTestApp()).get("/crash");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { message: "Internal server error" } });
  });

  it("returns 404 for unknown routes", async () => {
    const response = await request(buildTestApp()).get("/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { message: "Route not found" } });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && bun run test src/middleware/error.middleware.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```typescript
// backend/src/middleware/error.middleware.ts
import type { NextFunction, Request, Response } from "express";

export class AppError extends Error {
  readonly statusCode: number;
  readonly code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function notFoundHandler(_request: Request, response: Response) {
  response.status(404).json({ error: { message: "Route not found" } });
}

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
) {
  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: { message: error.message, ...(error.code ? { code: error.code } : {}) },
    });
    return;
  }

  console.error(error);
  response.status(500).json({ error: { message: "Internal server error" } });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && bun run test src/middleware/error.middleware.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/error.middleware.ts backend/src/middleware/error.middleware.test.ts
git commit -m "feat(backend): add centralized error handling middleware"
```

---

## Task 5: Auth middleware (`requireAuth`, `requireRole`)

**Files:**
- Create: `backend/src/middleware/auth.middleware.ts`
- Create: `backend/src/middleware/auth.middleware.test.ts`

**Interfaces:**
- Consumes: `verifyToken` from `lib/jwt.ts` (Task 3), `AppError` from `error.middleware.ts` (Task 4), `env.COOKIE_NAME` (Task 1).
- Produces: `requireAuth` (Express middleware, sets `request.user = { id: string; role: string }`), `requireRole(...roles: string[])` (middleware factory). Augments `Express.Request` with an optional `user` field.
- Consumed by: Task 6 (`GET /me` route), later business modules.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/middleware/auth.middleware.test.ts
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { env } from "../config/env";
import { signToken } from "../lib/jwt";
import { errorHandler } from "./error.middleware";
import { requireAuth, requireRole } from "./auth.middleware";

function buildTestApp() {
  const app = express();

  app.get("/protected", requireAuth, (request, response) => {
    response.json({ userId: request.user?.id, role: request.user?.role });
  });

  app.get("/admin-only", requireAuth, requireRole("ADMIN"), (_request, response) => {
    response.json({ ok: true });
  });

  app.use(errorHandler);

  return app;
}

describe("auth middleware", () => {
  it("rejects requests with no cookie", async () => {
    const response = await request(buildTestApp()).get("/protected");
    expect(response.status).toBe(401);
  });

  it("allows requests with a valid token cookie", async () => {
    const token = signToken({ sub: "user-1", role: "HR_MANAGER" });

    const response = await request(buildTestApp())
      .get("/protected")
      .set("Cookie", [`${env.COOKIE_NAME}=${token}`]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: "user-1", role: "HR_MANAGER" });
  });

  it("rejects requests with an invalid token cookie", async () => {
    const response = await request(buildTestApp())
      .get("/protected")
      .set("Cookie", [`${env.COOKIE_NAME}=garbage`]);

    expect(response.status).toBe(401);
  });

  it("rejects a role-restricted route when the role doesn't match", async () => {
    const token = signToken({ sub: "user-1", role: "HR_MANAGER" });

    const response = await request(buildTestApp())
      .get("/admin-only")
      .set("Cookie", [`${env.COOKIE_NAME}=${token}`]);

    expect(response.status).toBe(403);
  });

  it("allows a role-restricted route when the role matches", async () => {
    const token = signToken({ sub: "user-1", role: "ADMIN" });

    const response = await request(buildTestApp())
      .get("/admin-only")
      .set("Cookie", [`${env.COOKIE_NAME}=${token}`]);

    expect(response.status).toBe(200);
  });
});
```

Note: this test sends a raw `Cookie` header without `cookie-parser` mounted in the test app — `requireAuth` must therefore parse the cookie itself (via the `cookie` package) rather than depend on app-level `cookie-parser` having already run, so the middleware is self-contained and independently testable.

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && bun run test src/middleware/auth.middleware.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Add the `cookie` package and implement**

```bash
cd backend && bun add cookie
```

```typescript
// backend/src/middleware/auth.middleware.ts
import type { NextFunction, Request, Response } from "express";
import { parse } from "cookie";

import { env } from "../config/env.ts";
import { verifyToken } from "../lib/jwt.ts";
import { AppError } from "./error.middleware.ts";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: string };
    }
  }
}

export function requireAuth(request: Request, _response: Response, next: NextFunction) {
  const cookies = parse(request.headers.cookie ?? "");
  const token = cookies[env.COOKIE_NAME];

  if (!token) {
    next(new AppError(401, "Unauthorized"));
    return;
  }

  try {
    const payload = verifyToken(token);
    request.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new AppError(401, "Unauthorized"));
  }
}

export function requireRole(...roles: string[]) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!request.user || !roles.includes(request.user.role)) {
      next(new AppError(403, "Forbidden"));
      return;
    }
    next();
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && bun run test src/middleware/auth.middleware.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/auth.middleware.ts backend/src/middleware/auth.middleware.test.ts backend/package.json backend/bun.lock
git commit -m "feat(backend): add requireAuth and requireRole middleware"
```

---

## Task 6: Auth module — login, logout, me

**Files:**
- Create: `backend/src/modules/auth/auth.schema.ts`
- Create: `backend/src/modules/auth/auth.service.ts`
- Create: `backend/src/modules/auth/auth.service.test.ts`
- Create: `backend/src/modules/auth/auth.controller.ts`
- Create: `backend/src/modules/auth/auth.routes.ts`
- Create: `backend/src/modules/auth/auth.routes.test.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- Consumes: `prisma` (Task 3), `hashPassword`/`verifyPassword` (Task 3), `signToken` (Task 3), `AppError` (Task 4), `requireAuth` (Task 5), `env` (Task 1).
- Produces: `authRouter` (Express router) mounted at `/api/auth`; `loginSchema` (zod) reusable by frontend-adjacent validation docs only (not shared code — frontend has its own copy, these are separate apps).

This task requires a running Postgres with the Task 2 migration applied (`docker compose up -d postgres`, then `bun run prisma:migrate deploy` if not already applied).

- [ ] **Step 1: `auth.schema.ts`**

```typescript
// backend/src/modules/auth/auth.schema.ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;
```

- [ ] **Step 2: Write failing tests for `auth.service.ts`**

```typescript
// backend/src/modules/auth/auth.service.test.ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import { login } from "./auth.service";

const TEST_EMAIL = "foundation-test-user@example.com";
const TEST_PASSWORD = "correct-horse-battery-staple";

describe("auth.service login", () => {
  beforeAll(async () => {
    const passwordHash = await hashPassword(TEST_PASSWORD);
    await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        passwordHash,
        name: "Foundation Test User",
        role: "HR_MANAGER",
      },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { email: TEST_EMAIL } });
    await prisma.$disconnect();
  });

  it("returns a token and user for correct credentials", async () => {
    const result = await login(TEST_EMAIL, TEST_PASSWORD);

    expect(result.token).toEqual(expect.any(String));
    expect(result.user).toEqual({
      id: expect.any(String),
      email: TEST_EMAIL,
      name: "Foundation Test User",
      role: "HR_MANAGER",
    });
  });

  it("rejects an unknown email", async () => {
    await expect(login("nobody@example.com", TEST_PASSWORD)).rejects.toThrow("Invalid credentials");
  });

  it("rejects an incorrect password", async () => {
    await expect(login(TEST_EMAIL, "wrong-password")).rejects.toThrow("Invalid credentials");
  });

  it("rejects an inactive user", async () => {
    await prisma.user.update({ where: { email: TEST_EMAIL }, data: { isActive: false } });

    await expect(login(TEST_EMAIL, TEST_PASSWORD)).rejects.toThrow("Invalid credentials");

    await prisma.user.update({ where: { email: TEST_EMAIL }, data: { isActive: true } });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd backend && bun run test src/modules/auth/auth.service.test.ts`
Expected: FAIL — `./auth.service` does not exist.

- [ ] **Step 4: Implement `auth.service.ts`**

```typescript
// backend/src/modules/auth/auth.service.ts
import { AppError } from "../../middleware/error.middleware.ts";
import { verifyPassword } from "../../lib/password.ts";
import { prisma } from "../../lib/prisma.ts";
import { signToken } from "../../lib/jwt.ts";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export async function login(
  email: string,
  password: string,
): Promise<{ token: string; user: AuthenticatedUser }> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.isActive) {
    throw new AppError(401, "Invalid credentials");
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);

  if (!passwordMatches) {
    throw new AppError(401, "Invalid credentials");
  }

  const token = signToken({ sub: user.id, role: user.role });

  return {
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && bun run test src/modules/auth/auth.service.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Implement `auth.controller.ts` and `auth.routes.ts`**

```typescript
// backend/src/modules/auth/auth.controller.ts
import type { Request, Response } from "express";

import { env } from "../../config/env.ts";
import { AppError } from "../../middleware/error.middleware.ts";
import { prisma } from "../../lib/prisma.ts";
import { loginSchema } from "./auth.schema.ts";
import { login } from "./auth.service.ts";

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
};

export async function loginHandler(request: Request, response: Response) {
  const { email, password } = loginSchema.parse(request.body);
  const { token, user } = await login(email, password);

  response.cookie(env.COOKIE_NAME, token, COOKIE_OPTIONS);
  response.status(200).json({ user });
}

export function logoutHandler(_request: Request, response: Response) {
  response.clearCookie(env.COOKIE_NAME, COOKIE_OPTIONS);
  response.status(200).json({ message: "Logged out" });
}

export async function meHandler(request: Request, response: Response) {
  const user = await prisma.user.findUnique({ where: { id: request.user!.id } });

  if (!user) {
    response.clearCookie(env.COOKIE_NAME, COOKIE_OPTIONS);
    throw new AppError(401, "Unauthorized");
  }

  response.status(200).json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}
```

```typescript
// backend/src/modules/auth/auth.routes.ts
import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.ts";
import { loginHandler, logoutHandler, meHandler } from "./auth.controller.ts";

export const authRouter = Router();

authRouter.post("/login", loginHandler);
authRouter.post("/logout", logoutHandler);
authRouter.get("/me", requireAuth, meHandler);
```

- [ ] **Step 7: Wire into `app.ts`**

```typescript
// backend/src/app.ts
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env.ts";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware.ts";
import { authRouter } from "./modules/auth/auth.routes.ts";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

app.use("/api/auth", authRouter);

app.use(notFoundHandler);
app.use(errorHandler);
```

```bash
cd backend && bun add cookie-parser && bun add -D @types/cookie-parser
```

- [ ] **Step 8: Write failing integration tests for the routes**

```typescript
// backend/src/modules/auth/auth.routes.test.ts
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

const TEST_EMAIL = "foundation-route-test@example.com";
const TEST_PASSWORD = "correct-horse-battery-staple";

describe("auth routes", () => {
  beforeAll(async () => {
    const passwordHash = await hashPassword(TEST_PASSWORD);
    await prisma.user.create({
      data: { email: TEST_EMAIL, passwordHash, name: "Route Test User", role: "ADMIN" },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { email: TEST_EMAIL } });
    await prisma.$disconnect();
  });

  it("logs in and sets a session cookie", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(TEST_EMAIL);
    expect(response.headers["set-cookie"]?.[0]).toMatch(/^session=/);
  });

  it("rejects invalid credentials with 401", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_EMAIL, password: "wrong" });

    expect(response.status).toBe(401);
  });

  it("returns the current user from /me when authenticated", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    const response = await agent.get("/api/auth/me");

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(TEST_EMAIL);
  });

  it("returns 401 from /me when not authenticated", async () => {
    const response = await request(app).get("/api/auth/me");
    expect(response.status).toBe(401);
  });

  it("clears the cookie on logout", async () => {
    const response = await request(app).post("/api/auth/logout");

    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"]?.[0]).toMatch(/^session=;/);
  });
});
```

- [ ] **Step 9: Run to verify it fails, then passes**

Run: `cd backend && bun run test src/modules/auth/auth.routes.test.ts`
Expected first: FAIL (routes/app not wired or cookie-parser missing).
After step 7's wiring: PASS (5 tests).

- [ ] **Step 10: Run the full backend suite**

Run: `cd backend && bun run test`
Expected: all tests pass, including the pre-existing `app.test.ts` health check.

- [ ] **Step 11: Commit**

```bash
git add backend/src/modules/auth backend/src/app.ts backend/package.json backend/bun.lock
git commit -m "feat(backend): add login/logout/me auth endpoints"
```

---

## Task 7: Frontend — remove Tailwind, MUI only

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/app/app.css`
- Delete: `frontend/app/welcome/` (welcome.tsx, logo-dark.svg, logo-light.svg) — being replaced by real routes in Tasks 9–11
- Modify: `frontend/app/routes/home.tsx`
- Modify: `frontend/app/root.tsx`

**Interfaces:**
- No code interfaces — this is cleanup. Later tasks assume no Tailwind classes remain and `home.tsx` is a minimal placeholder.

- [ ] **Step 1: Remove Tailwind dependencies**

```bash
cd frontend && bun remove tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Update `vite.config.ts`**

```typescript
// frontend/vite.config.ts
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
});
```

- [ ] **Step 3: Strip Tailwind from `app.css`**

```css
/* frontend/app/app.css */
html,
body {
  margin: 0;
  padding: 0;
}

@media (prefers-color-scheme: dark) {
  html {
    color-scheme: dark;
  }
}
```

- [ ] **Step 4: Delete the welcome boilerplate and simplify `home.tsx`**

```bash
cd frontend && rm -rf app/welcome
```

```typescript
// frontend/app/routes/home.tsx
import type { Route } from "./+types/home";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Salary Management" }];
}

export default function Home() {
  return null;
}
```

(This route is superseded by the redirect logic added in Task 11 — kept as a trivial placeholder for now so the route tree doesn't break mid-task.)

- [ ] **Step 5: Remove Tailwind classes from `root.tsx`'s `ErrorBoundary`**

```typescript
// frontend/app/root.tsx — replace only the ErrorBoundary's returned JSX
  return (
    <main style={{ paddingTop: 64, padding: 16 }}>
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre style={{ width: "100%", padding: 16, overflowX: "auto" }}>
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
```

- [ ] **Step 6: Verify the app still builds and typechecks**

Run: `cd frontend && bun run typecheck`
Expected: no errors.

Run: `cd frontend && bun run build`
Expected: build succeeds with no Tailwind in the output CSS.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/bun.lock frontend/vite.config.ts frontend/app
git commit -m "chore(frontend): remove tailwind, mui-only styling"
```

---

## Task 8: Frontend API client

**Files:**
- Create: `frontend/app/lib/api-client.ts`
- Create: `frontend/app/lib/api-client.test.ts`
- Create: `frontend/.env.example`
- Modify: `frontend/vite.config.ts` (none needed — Vite env vars work via `import.meta.env` automatically; no config change required, listed here only as a non-change note)

**Interfaces:**
- Produces: `apiFetch(path: string, init?: RequestInit): Promise<Response>` — prefixes `path` with the API base URL, always sets `credentials: 'include'`, forwards a `cookie` header when provided (for SSR loader use).
- Consumed by: Task 10 (login route action), Task 11 (protected route loader).

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/app/lib/api-client.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "./api-client";

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefixes the path with the API base URL and includes credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/auth/me");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/auth/me",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("forwards a cookie header when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/auth/me", { headers: { cookie: "session=abc" } });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.cookie).toBe("session=abc");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && bun run test app/lib/api-client.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```typescript
// frontend/app/lib/api-client.ts
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && bun run test app/lib/api-client.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Add `.env.example`**

```bash
# frontend/.env.example
VITE_API_URL=http://localhost:3001
```

- [ ] **Step 6: Commit**

```bash
git add frontend/app/lib frontend/.env.example
git commit -m "feat(frontend): add api client with credentialed fetch"
```

---

## Task 9: AppLayout and PageHeader components

**Files:**
- Create: `frontend/app/components/layout/AppLayout.tsx`
- Create: `frontend/app/components/layout/AppLayout.test.tsx`
- Create: `frontend/app/components/layout/PageHeader.tsx`
- Modify: `frontend/app/root.tsx` (theme tweak only if needed — none required, listed for completeness)

**Interfaces:**
- Produces: `AppLayout` (default export, renders `AppBar` + nav `Drawer` + `<Outlet />`), `PageHeader` (props: `{ title: string; action?: React.ReactNode }`).
- Consumed by: Task 11 (wraps protected routes in `routes.ts`).

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/app/components/layout/AppLayout.test.tsx
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import AppLayout from "./AppLayout";

describe("AppLayout", () => {
  it("renders the app title and navigation links", () => {
    const router = createMemoryRouter([
      {
        path: "/",
        Component: AppLayout,
        children: [{ index: true, Component: () => <div>child content</div> }],
      },
    ]);

    render(<RouterProvider router={router} />);

    expect(screen.getByText("Salary Management")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Employees" })).toBeInTheDocument();
    expect(screen.getByText("child content")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && bun run test app/components/layout/AppLayout.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `AppLayout.tsx`**

```typescript
// frontend/app/components/layout/AppLayout.tsx
import { AppBar, Box, Drawer, List, ListItemButton, ListItemText, Toolbar, Typography } from "@mui/material";
import { Link, Outlet } from "react-router";

const DRAWER_WIDTH = 220;

const NAV_ITEMS = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "Employees", to: "/employees" },
  { label: "Salaries", to: "/salaries" },
  { label: "Analytics", to: "/analytics" },
];

export default function AppLayout() {
  return (
    <Box sx={{ display: "flex" }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" noWrap component="div">
            Salary Management
          </Typography>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: DRAWER_WIDTH, boxSizing: "border-box" },
        }}
      >
        <Toolbar />
        <List>
          {NAV_ITEMS.map((item) => (
            <ListItemButton key={item.to} component={Link} to={item.to}>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && bun run test app/components/layout/AppLayout.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Implement `PageHeader.tsx` (no test — trivial presentational component)**

```typescript
// frontend/app/components/layout/PageHeader.tsx
import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  action?: ReactNode;
}

export default function PageHeader({ title, action }: PageHeaderProps) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
      <Typography variant="h4" component="h1">
        {title}
      </Typography>
      {action}
    </Box>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/app/components
git commit -m "feat(frontend): add AppLayout and PageHeader components"
```

---

## Task 10: Login route

**Files:**
- Create: `frontend/app/routes/login.tsx`
- Create: `frontend/app/routes/login.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` (Task 8).
- Produces: default-exported `Login` route component with an RR7 `action` (`loginAction`) that posts credentials and redirects to `/dashboard` on success.
- Consumed by: Task 11's `routes.ts` route tree.

New dependencies: `react-hook-form`, `@hookform/resolvers`, `zod` (frontend doesn't have `zod` yet).

```bash
cd frontend && bun add react-hook-form @hookform/resolvers zod
```

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/app/routes/login.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import Login from "./login";

describe("Login route component", () => {
  it("shows validation errors for empty submission", async () => {
    const user = userEvent.setup();
    render(<Login actionData={undefined} />);

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(await screen.findByText("Password is required")).toBeInTheDocument();
  });

  it("shows a server-provided error", () => {
    render(<Login actionData={{ error: "Invalid credentials" }} />);

    expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
  });
});
```

(This test renders `Login` as a plain component with a mocked `actionData` prop rather than through a full RR7 router — keeps the test focused on form behavior. The real route wiring is exercised manually in Task 12's end-to-end check.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && bun run test app/routes/login.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```typescript
// frontend/app/routes/login.tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Box, Button, Paper, TextField, Typography } from "@mui/material";
import { Controller, useForm } from "react-hook-form";
import { redirect, useNavigation, useSubmit } from "react-router";
import { z } from "zod";

import { apiFetch } from "~/lib/api-client";
import type { Route } from "./+types/login";

const loginFormSchema = z.object({
  email: z.string().min(1, "Enter a valid email").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const response = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    return { error: "Invalid credentials" };
  }

  const setCookie = response.headers.get("set-cookie");
  const headers = setCookie ? { "Set-Cookie": setCookie } : undefined;

  return redirect("/dashboard", headers ? { headers } : undefined);
}

interface LoginProps {
  actionData?: { error?: string };
}

export default function Login({ actionData }: LoginProps = {}) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (values: LoginFormValues) => {
    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("password", values.password);
    submit(formData, { method: "post" });
  };

  return (
    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      <Paper sx={{ p: 4, width: 360 }} component="form" onSubmit={handleSubmit(onSubmit)}>
        <Typography variant="h5" component="h1" gutterBottom>
          Sign in
        </Typography>

        {actionData?.error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {actionData.error}
          </Alert>
        )}

        <Controller
          name="email"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Email"
              fullWidth
              margin="normal"
              error={!!errors.email}
              helperText={errors.email?.message}
            />
          )}
        />

        <Controller
          name="password"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Password"
              type="password"
              fullWidth
              margin="normal"
              error={!!errors.password}
              helperText={errors.password?.message}
            />
          )}
        />

        <Button
          type="submit"
          variant="contained"
          fullWidth
          sx={{ mt: 2 }}
          disabled={navigation.state === "submitting"}
        >
          Sign in
        </Button>
      </Paper>
    </Box>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && bun run test app/routes/login.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/app/routes/login.tsx frontend/app/routes/login.test.tsx frontend/package.json frontend/bun.lock
git commit -m "feat(frontend): add login route with validation"
```

---

## Task 11: Route protection, dashboard placeholder, route tree

**Files:**
- Create: `frontend/app/routes/dashboard.tsx`
- Create: `frontend/app/routes/dashboard.test.tsx`
- Modify: `frontend/app/routes.ts`
- Modify: `frontend/app/routes/home.tsx` (redirect to `/dashboard` or `/login`)

**Interfaces:**
- Consumes: `AppLayout` (Task 9), `apiFetch` (Task 8), `Login` route (Task 10).
- Produces: route tree — `/login` (public), `/` layout route wrapping `/dashboard` (and future `/employees`, `/salaries`, `/analytics`) behind a `requireUserLoader`.

- [ ] **Step 1: Write the failing test for the dashboard loader's redirect behavior**

```typescript
// frontend/app/routes/dashboard.test.tsx
import { afterEach, describe, expect, it, vi } from "vitest";

import { loader } from "./dashboard";

describe("dashboard loader", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redirects to /login when the backend reports unauthenticated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );

    const response = await loader({
      request: new Request("http://localhost:3000/dashboard"),
      params: {},
      context: {},
    } as Parameters<typeof loader>[0]);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/login");
  });

  it("returns the user when authenticated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ user: { id: "1", email: "a@b.com", name: "A", role: "ADMIN" } }), {
          status: 200,
        }),
      ),
    );

    const result = await loader({
      request: new Request("http://localhost:3000/dashboard"),
      params: {},
      context: {},
    } as Parameters<typeof loader>[0]);

    expect(result).toEqual({ user: { id: "1", email: "a@b.com", name: "A", role: "ADMIN" } });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && bun run test app/routes/dashboard.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `dashboard.tsx`**

```typescript
// frontend/app/routes/dashboard.tsx
import { redirect } from "react-router";

import PageHeader from "~/components/layout/PageHeader";
import { apiFetch } from "~/lib/api-client";
import type { Route } from "./+types/dashboard";

export async function loader({ request }: Route.LoaderArgs) {
  const cookie = request.headers.get("cookie");

  const response = await apiFetch("/api/auth/me", {
    headers: cookie ? { cookie } : undefined,
  });

  if (!response.ok) {
    throw redirect("/login");
  }

  return response.json();
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <PageHeader title="Dashboard" />
      <p>Signed in as {loaderData.user.name} ({loaderData.user.role}).</p>
    </>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && bun run test app/routes/dashboard.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Update `routes.ts`**

```typescript
// frontend/app/routes.ts
import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  route("login", "routes/login.tsx"),
  layout("components/layout/AppLayout.tsx", [
    route("dashboard", "routes/dashboard.tsx"),
  ]),
  index("routes/home.tsx"),
] satisfies RouteConfig;
```

- [ ] **Step 6: Make `home.tsx` redirect to `/dashboard`**

```typescript
// frontend/app/routes/home.tsx
import { redirect } from "react-router";

export function loader() {
  return redirect("/dashboard");
}

export default function Home() {
  return null;
}
```

- [ ] **Step 7: Full frontend verification**

Run: `cd frontend && bun run typecheck && bun run test`
Expected: typecheck clean, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/app/routes.ts frontend/app/routes/dashboard.tsx frontend/app/routes/dashboard.test.tsx frontend/app/routes/home.tsx
git commit -m "feat(frontend): add protected dashboard route and route tree"
```

---

## Task 12: End-to-end verification and documentation

**Files:**
- Modify: `README.md`
- Modify: `backend/README.md`
- Create: `docs/implementation/2026-10-02-foundation-summary.md`

**Interfaces:** None — this task verifies the whole system and writes up the result. No code changes beyond docs.

- [ ] **Step 1: Full stack smoke test via Docker Compose**

Run: `docker compose up --build`
Expected: Postgres healthy, backend migrates/starts on `:3001`, frontend starts on `:3000`.

Visit `http://localhost:3001/health` → `{"status":"ok"}`.
Visit `http://localhost:3000` → redirects to `/login`.
Log in with the seeded admin (`admin@salary-management.local` / `ChangeMe123!`) → redirects to `/dashboard`, shows "Signed in as Dev Admin (ADMIN)".
Log out (manually via `POST /api/auth/logout` or a logout button if time allows — logout UI is optional polish, not required for this task) and confirm `/dashboard` redirects back to `/login`.

Run: `docker compose down`

- [ ] **Step 2: Run both test suites one final time**

Run: `cd backend && bun run typecheck && bun run test`
Run: `cd frontend && bun run typecheck && bun run test`
Expected: both clean.

- [ ] **Step 3: Update `README.md`**

Update the root `README.md` to mention: local dev without Docker (`docker compose up -d postgres`, then `bun install && bun run prisma:migrate deploy && bun run db:seed && bun run dev` in `backend/`, `bun install && bun run dev` in `frontend/`), the seeded admin credentials, and that `PORT` is standardized to `3001` for the backend.

- [ ] **Step 4: Update `backend/README.md`**

Add a note about `bun run db:seed` and the `JWT_SECRET`/`FRONTEND_URL`/`COOKIE_NAME` env vars introduced in this phase.

- [ ] **Step 5: Write the implementation summary**

Create `docs/implementation/2026-10-02-foundation-summary.md` covering: what was built (env config, Prisma `User`/`Role` schema + seed, error/auth middleware, `/api/auth/*` endpoints, MUI-only frontend shell, login/dashboard routes, route protection), key decisions (JWT httpOnly cookie, Bun kept, Tailwind removed, minimal schema), APIs added (`POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`), database changes (`User` table, `Role` enum, migration name), tests added (list files), known limitations (no admin user-management UI yet, SameSite=Lax assumes same registrable domain in prod), and what the next session should build (Phase 1 per `docs/03-modules-and-use-cases.md`: Employee module — schema, CRUD endpoints, directory UI).

- [ ] **Step 6: Commit**

```bash
git add README.md backend/README.md docs/implementation/2026-10-02-foundation-summary.md
git commit -m "docs: document foundation implementation and next steps"
```

- [ ] **Step 7: Push branch and open PR**

```bash
git push -u origin feature/foundation
gh pr create --title "Foundation: config, auth, MUI shell" --body "Implements docs/superpowers/specs/2026-10-02-foundation-design.md. See docs/implementation/2026-10-02-foundation-summary.md for details." --base main
```

Do not merge automatically — wait for review per the project's branch workflow.
