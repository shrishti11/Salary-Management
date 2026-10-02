# Employee Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the Employee Management module: Department/Employee schema, REST API (create, list with search/filter/sort/pagination, get, update, status change), and a React/MUI UI (directory, profile, create/edit forms, deactivate confirmation).

**Architecture:** New backend module `modules/employees` (routes → controller → service → Prisma, zod schema) mirroring `modules/auth`, plus a tiny read-only `modules/departments`. Frontend adds four routes under the existing `routes/authenticated.tsx` layout. Loaders/actions call the backend server-side through `apiFetch` with the incoming cookie forwarded. List state lives in URL search params.

**Tech Stack:** Express 5, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL, zod 4, Vitest + Supertest; React Router v8 SSR, MUI v9, React Hook Form + zod, Vitest + React Testing Library. Bun as package manager.

**Spec:** `docs/superpowers/specs/2026-10-02-employee-management-design.md` (read it first; executors read both).

## Global Constraints

- Work on branch `feature/employee-management` (already created). Never commit to `main`.
- No new dependencies in either `package.json`. No `@mui/icons-material`, no `@mui/x-*`.
- Backend source imports use `.ts` extensions (existing convention); tests import without extension (existing convention).
- API error format is `{ error: { message, code? } }`. Single resources: `{ employee }`. Lists: `{ data, pagination: { page, pageSize, total, totalPages } }`. Departments: `{ departments: [{ id, name }] }`.
- Employee JSON always includes `department: { id, name }` and `joiningDate` as `YYYY-MM-DD` string.
- `employeeCode`: trimmed + uppercased, 1-32 chars, `[A-Z0-9_-]`, unique, immutable after create. `email`: trimmed + lowercased, unique.
- `country`: ISO alpha-2 from the supported list (`IN US GB CA AU DE FR SG AE JP CN BR NL SE CH IE ES IT MX ZA NZ`).
- Status enum `ACTIVE | INACTIVE`; no DELETE route anywhere.
- Both roles `ADMIN` and `HR_MANAGER` may use every employee/department route (`requireAuth` + explicit `requireRole("ADMIN","HR_MANAGER")`).
- Frontend: MUI only, native `<select>` via `TextField select` + `slotProps.select.native` for filters/forms, no icons.
- Backend tests need local Postgres: `docker compose up -d postgres` from repo root, `backend/.env` present. Run single files with `cd backend && bunx vitest run <path>`; frontend with `cd frontend && bunx vitest run <path>`.
- Commit after every task, conventional-commit messages.

## Review Focus

1. Search text containing `%` or `_` must match literally, not act as a wildcard (Task 4 test).
2. Page beyond the last page / hand-edited URL params: backend returns empty `data` with correct `total` for large `page` and 400 for invalid params; the frontend list falls back to defaults or redirects to the last page instead of crashing (Task 4, Task 6 tests).
3. Duplicate detection must ignore case and surrounding whitespace (`" ASHA@Example.com "` vs stored `asha@example.com`) (Task 3 test).
4. A deactivated employee stays listed, viewable and editable; deactivating twice is idempotent (Task 3, Task 4 tests).
5. Blank/invalid update values: `designation: ""` is 400, `phone: ""` clears the phone, an empty PATCH body is 400, and `employeeCode` in a PATCH body is 400 (Task 3 tests). Also: submit buttons are disabled while a submission is in flight (Task 7 test).

---

## File Structure

Backend (`backend/`):
- Modify `prisma/schema.prisma`, `prisma/seed.ts`, `src/app.ts`
- Create `prisma/migrations/<ts>_add_employee_department/`
- Create `src/lib/countries.ts` — supported country codes
- Create `src/modules/employees/{employee.schema,employee.service,employee.controller,employee.routes}.ts`
- Create `src/modules/departments/{department.service,department.controller,department.routes}.ts`
- Create `src/test/helpers.ts` — test user/login/forged-cookie helpers
- Create tests: `employee.schema.test.ts`, `employee.routes.test.ts`, `employee.list.test.ts`, `departments.routes.test.ts`

Frontend (`frontend/app/`):
- Modify `lib/api-client.ts` (+test), `routes.ts`, `routes.test.ts`
- Create `lib/countries.ts`, `lib/employee-form.ts`, `lib/employees-api.ts` (+tests)
- Create `components/common/{StatusChip,ConfirmDialog}.tsx`
- Create `components/employees/{EmployeeTable,EmployeeFilters,EmployeeForm}.tsx`
- Create `routes/{employees,employee-new,employee-profile,employee-edit}.tsx` (+tests)

Docs: status, READMEs, implementation summary (Task 9).

---

### Task 1: Schema, migration, seed

**Files:**
- Modify: `backend/prisma/schema.prisma`, `backend/prisma/seed.ts`
- Create: migration via CLI

**Interfaces:**
- Produces: Prisma models `Department { id, name, ... }`, `Employee { id, employeeCode, firstName, lastName, email, phone?, departmentId, designation, country, joiningDate, status, createdAt, updatedAt }`, enum `EmployeeStatus`. Generated client at `backend/generated/prisma`.

- [ ] **Step 1: Add models to `schema.prisma`** (append after `User`)

```prisma
enum EmployeeStatus {
  ACTIVE
  INACTIVE
}

model Department {
  id        String     @id @default(uuid())
  name      String     @unique
  employees Employee[]
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
}

model Employee {
  id           String         @id @default(uuid())
  employeeCode String         @unique
  firstName    String
  lastName     String
  email        String         @unique
  phone        String?
  departmentId String
  department   Department     @relation(fields: [departmentId], references: [id], onDelete: Restrict)
  designation  String
  country      String         @db.Char(2)
  joiningDate  DateTime       @db.Date
  status       EmployeeStatus @default(ACTIVE)
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt

  @@index([status])
  @@index([departmentId])
  @@index([country])
  @@index([lastName, firstName])
}
```

- [ ] **Step 2: Migrate and regenerate**

Postgres must be running. From `backend/`:

```bash
bun run prisma:migrate --name add_employee_department
bun run prisma:generate
```

Expected: new folder `prisma/migrations/<timestamp>_add_employee_department/migration.sql` containing `CREATE TYPE "EmployeeStatus"`, `CREATE TABLE "Department"`, `CREATE TABLE "Employee"`, unique indexes on `employeeCode`, `email`, `Department.name`, and the four `@@index` indexes. (Prisma 7 does not auto-generate after migrate, so run `prisma:generate` explicitly. If `prisma:migrate` fails to find the config, look at how the foundation migration `20261002103833_add_user_model` was created and use the same invocation.)

- [ ] **Step 3: Extend the seed (idempotent)**

In `backend/prisma/seed.ts`, inside `main()` after the admin upsert and before `$disconnect`, add:

```ts
  const departmentNames = [
    "Engineering",
    "Human Resources",
    "Finance",
    "Sales",
    "Marketing",
    "Operations",
  ];
  const departments = new Map<string, string>();
  for (const name of departmentNames) {
    const department = await prisma.department.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    departments.set(name, department.id);
  }

  const sampleEmployees = [
    { employeeCode: "EMP-0001", firstName: "Asha", lastName: "Rao", email: "asha.rao@example.com", department: "Engineering", designation: "Senior Engineer", country: "IN", joiningDate: "2021-03-15" },
    { employeeCode: "EMP-0002", firstName: "John", lastName: "Smith", email: "john.smith@example.com", department: "Finance", designation: "Financial Analyst", country: "US", joiningDate: "2020-07-01" },
    { employeeCode: "EMP-0003", firstName: "Emma", lastName: "Wilson", email: "emma.wilson@example.com", department: "Human Resources", designation: "HR Manager", country: "GB", joiningDate: "2019-11-20" },
    { employeeCode: "EMP-0004", firstName: "Lars", lastName: "Meyer", email: "lars.meyer@example.com", department: "Sales", designation: "Account Executive", country: "DE", joiningDate: "2022-01-10" },
    { employeeCode: "EMP-0005", firstName: "Mei", lastName: "Tan", email: "mei.tan@example.com", department: "Operations", designation: "Operations Lead", country: "SG", joiningDate: "2018-05-02", status: "INACTIVE" as const },
  ];
  for (const { department, joiningDate, ...rest } of sampleEmployees) {
    await prisma.employee.upsert({
      where: { employeeCode: rest.employeeCode },
      update: {},
      create: {
        ...rest,
        departmentId: departments.get(department)!,
        joiningDate: new Date(`${joiningDate}T00:00:00.000Z`),
      },
    });
  }
  console.log(`Seeded ${departmentNames.length} departments and ${sampleEmployees.length} employees`);
```

- [ ] **Step 4: Verify idempotency**

```bash
cd backend && bun run db:seed && bun run db:seed
docker compose exec postgres psql -U postgres -d salary_management -c 'select count(*) from "Employee"; select count(*) from "Department";'
```

Expected: both seed runs succeed; counts 5 and 6 at least (no growth on second run). Then `bun run typecheck` and `bun run test` (existing tests still pass).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma
git commit -m "feat(backend): add Department and Employee models, migration and seed"
```

---

### Task 2: Employee validation schemas

**Files:**
- Create: `backend/src/lib/countries.ts`, `backend/src/modules/employees/employee.schema.ts`
- Test: `backend/src/modules/employees/employee.schema.test.ts`

**Interfaces:**
- Produces (from `employee.schema.ts`): `createEmployeeSchema`, `updateEmployeeSchema`, `statusSchema`, `idParamSchema`, `listEmployeesQuerySchema`, and types `CreateEmployeeInput`, `UpdateEmployeeInput`, `ListEmployeesQuery`, `EmployeeStatusValue = "ACTIVE" | "INACTIVE"`. `COUNTRY_CODES` from `lib/countries.ts`.
- Parsed `CreateEmployeeInput`: `{ employeeCode, firstName, lastName, email, phone?: string | null, departmentId, designation, country, joiningDate: "YYYY-MM-DD" }`.
- Parsed `ListEmployeesQuery`: `{ page, pageSize, q?, departmentId?, country?, status?, sortBy, sortOrder }` with defaults applied.

- [ ] **Step 1: Write the failing test** `employee.schema.test.ts`

```ts
import { describe, expect, it } from "vitest";

import {
  createEmployeeSchema,
  idParamSchema,
  listEmployeesQuerySchema,
  statusSchema,
  updateEmployeeSchema,
} from "./employee.schema";

const DEPARTMENT_ID = "6f1c1a4e-3a53-4b2e-9a53-0d1b6c0f5a11";

const valid = {
  employeeCode: "emp-001",
  firstName: " Asha ",
  lastName: "Rao",
  email: " Asha.Rao@Example.COM ",
  departmentId: DEPARTMENT_ID,
  designation: "Engineer",
  country: "IN",
  joiningDate: "2024-01-15",
};

describe("createEmployeeSchema", () => {
  it("normalises code, names and email", () => {
    const parsed = createEmployeeSchema.parse(valid);
    expect(parsed.employeeCode).toBe("EMP-001");
    expect(parsed.firstName).toBe("Asha");
    expect(parsed.email).toBe("asha.rao@example.com");
    expect(parsed.phone).toBeUndefined();
  });

  it("turns an empty phone into null and accepts a formatted one", () => {
    expect(createEmployeeSchema.parse({ ...valid, phone: "" }).phone).toBeNull();
    expect(createEmployeeSchema.parse({ ...valid, phone: "+91 (98) 7654-3210" }).phone).toBe(
      "+91 (98) 7654-3210",
    );
  });

  it.each([
    ["missing firstName", { firstName: undefined }],
    ["blank designation", { designation: "   " }],
    ["bad email", { email: "nope" }],
    ["bad code chars", { employeeCode: "EMP 001!" }],
    ["code too long", { employeeCode: "A".repeat(33) }],
    ["bad phone", { phone: "abc" }],
    ["unsupported country", { country: "ZZ" }],
    ["lowercase country", { country: "in" }],
    ["non-uuid department", { departmentId: "123" }],
    ["malformed date", { joiningDate: "15/01/2024" }],
    ["impossible date", { joiningDate: "2024-02-30" }],
    ["future date", { joiningDate: "2999-01-01" }],
  ])("rejects %s", (_name, override) => {
    expect(createEmployeeSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it("accepts today as the joining date", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(createEmployeeSchema.safeParse({ ...valid, joiningDate: today }).success).toBe(true);
  });
});

describe("updateEmployeeSchema", () => {
  it("accepts a partial body", () => {
    expect(updateEmployeeSchema.parse({ designation: "Lead" })).toEqual({ designation: "Lead" });
  });

  it("rejects an empty body, employeeCode and status", () => {
    expect(updateEmployeeSchema.safeParse({}).success).toBe(false);
    expect(updateEmployeeSchema.safeParse({ employeeCode: "X1" }).success).toBe(false);
    expect(updateEmployeeSchema.safeParse({ status: "INACTIVE" }).success).toBe(false);
  });

  it("rejects blank values and clears phone with an empty string", () => {
    expect(updateEmployeeSchema.safeParse({ designation: "" }).success).toBe(false);
    expect(updateEmployeeSchema.parse({ phone: "" })).toEqual({ phone: null });
  });
});

describe("statusSchema and idParamSchema", () => {
  it("only allows ACTIVE and INACTIVE", () => {
    expect(statusSchema.safeParse({ status: "ACTIVE" }).success).toBe(true);
    expect(statusSchema.safeParse({ status: "FIRED" }).success).toBe(false);
  });

  it("requires a uuid id", () => {
    expect(idParamSchema.safeParse({ id: DEPARTMENT_ID }).success).toBe(true);
    expect(idParamSchema.safeParse({ id: "abc" }).success).toBe(false);
  });
});

describe("listEmployeesQuerySchema", () => {
  it("applies defaults and coerces numbers", () => {
    expect(listEmployeesQuerySchema.parse({})).toMatchObject({
      page: 1,
      pageSize: 20,
      sortBy: "employeeCode",
      sortOrder: "asc",
    });
    expect(listEmployeesQuerySchema.parse({ page: "3", pageSize: "50" })).toMatchObject({
      page: 3,
      pageSize: 50,
    });
  });

  it.each([
    { page: "0" },
    { page: "1.5" },
    { pageSize: "101" },
    { sortBy: "passwordHash" },
    { sortOrder: "up" },
    { status: "FIRED" },
    { country: "ZZ" },
    { departmentId: "x" },
    { unknown: "1" },
  ])("rejects %o", (query) => {
    expect(listEmployeesQuerySchema.safeParse(query).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && bunx vitest run src/modules/employees/employee.schema.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`backend/src/lib/countries.ts`:

```ts
export const COUNTRY_CODES = [
  "IN", "US", "GB", "CA", "AU", "DE", "FR", "SG", "AE", "JP",
  "CN", "BR", "NL", "SE", "CH", "IE", "ES", "IT", "MX", "ZA", "NZ",
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];
```

`backend/src/modules/employees/employee.schema.ts`:

```ts
import { z } from "zod";

import { COUNTRY_CODES } from "../../lib/countries.ts";

export const EMPLOYEE_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type EmployeeStatusValue = (typeof EMPLOYEE_STATUSES)[number];

export const SORT_FIELDS = [
  "employeeCode",
  "name",
  "department",
  "designation",
  "country",
  "joiningDate",
  "status",
] as const;
export type SortField = (typeof SORT_FIELDS)[number];

const requiredText = (max: number) => z.string().trim().min(1).max(max);

const phoneSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .refine((value) => value === null || /^[0-9+\-() ]{7,20}$/.test(value), "Invalid phone number");

const joiningDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Invalid date")
  .refine((value) => value <= new Date().toISOString().slice(0, 10), "Joining date cannot be in the future");

export const createEmployeeSchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .toUpperCase()
    .min(1)
    .max(32)
    .regex(/^[A-Z0-9_-]+$/),
  firstName: requiredText(100),
  lastName: requiredText(100),
  email: z.string().trim().toLowerCase().max(254).email(),
  phone: phoneSchema.optional(),
  departmentId: z.uuid(),
  designation: requiredText(100),
  country: z.enum(COUNTRY_CODES),
  joiningDate: joiningDateSchema,
});

export const updateEmployeeSchema = createEmployeeSchema
  .omit({ employeeCode: true })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const statusSchema = z.object({ status: z.enum(EMPLOYEE_STATUSES) });

export const idParamSchema = z.object({ id: z.uuid() });

export const listEmployeesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().max(100).optional(),
    departmentId: z.uuid().optional(),
    country: z.enum(COUNTRY_CODES).optional(),
    status: z.enum(EMPLOYEE_STATUSES).optional(),
    sortBy: z.enum(SORT_FIELDS).default("employeeCode"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && bunx vitest run src/modules/employees/employee.schema.test.ts && bun run typecheck`
Expected: PASS. If a zod 4 detail differs (e.g. `.strict()` on a refined/omitted object, or `.nullable()` after `.transform()`), adjust the implementation, keeping the tested behavior.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/countries.ts backend/src/modules/employees
git commit -m "feat(backend): add employee validation schemas"
```

---

### Task 3: Employee service/API (create, get, update, status) and departments

**Files:**
- Create: `backend/src/modules/employees/employee.service.ts`, `employee.controller.ts`, `employee.routes.ts`
- Create: `backend/src/modules/departments/department.service.ts`, `department.controller.ts`, `department.routes.ts`
- Create: `backend/src/test/helpers.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/src/modules/employees/employee.routes.test.ts`, `backend/src/modules/departments/departments.routes.test.ts`

**Interfaces:**
- Consumes: schemas and types from Task 2; `requireAuth`, `requireRole`, `AppError`, `prisma`.
- Produces (service): `createEmployee(input: CreateEmployeeInput)`, `getEmployee(id: string)`, `updateEmployee(id: string, input: UpdateEmployeeInput)`, `setEmployeeStatus(id: string, status: EmployeeStatusValue)` all returning `EmployeeDto`; `serializeEmployee`; `listDepartments()`. (`listEmployees` is added in Task 4.)
- Produces (test helpers): `createTestUser(email, role?)`, `loginAs(email): Promise<TestAgent>`, `forgedCookie(role: string): string`.
- `EmployeeDto`: `{ id, employeeCode, firstName, lastName, email, phone: string | null, departmentId, department: {id, name}, designation, country, joiningDate: string, status, createdAt: Date, updatedAt: Date }`.
- Error codes: 404 `EMPLOYEE_NOT_FOUND`; 400 `INVALID_DEPARTMENT`; 409 `DUPLICATE_EMPLOYEE_CODE`, `DUPLICATE_EMAIL`.

- [ ] **Step 1: Test helpers** `backend/src/test/helpers.ts`

```ts
import { randomUUID } from "node:crypto";

import request from "supertest";

import { app } from "../app";
import { env } from "../config/env";
import { signToken } from "../lib/jwt";
import { hashPassword } from "../lib/password";
import { prisma } from "../lib/prisma";

export const TEST_PASSWORD = "correct-horse-battery-staple";

export async function createTestUser(email: string, role: "ADMIN" | "HR_MANAGER" = "HR_MANAGER") {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  return prisma.user.create({ data: { email, passwordHash, name: "Test User", role } });
}

export async function loginAs(email: string) {
  const agent = request.agent(app);
  const response = await agent.post("/api/auth/login").send({ email, password: TEST_PASSWORD });
  if (response.status !== 200) throw new Error(`Test login failed: ${response.status}`);
  return agent;
}

/** A validly signed session cookie for a role the DB enum does not contain (requireAuth is stateless). */
export function forgedCookie(role: string): string {
  return `${env.COOKIE_NAME}=${signToken({ sub: randomUUID(), role })}`;
}
```

- [ ] **Step 2: Write the failing integration tests** `backend/src/modules/employees/employee.routes.test.ts`

```ts
import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../app";
import { prisma } from "../../lib/prisma";
import { createTestUser, forgedCookie, loginAs } from "../../test/helpers";

const SUFFIX = randomUUID().slice(0, 8);
const USER_EMAIL = `emp-routes-${SUFFIX}@example.com`;

let departmentId: string;
let otherDepartmentId: string;
let agent: Awaited<ReturnType<typeof loginAs>>;

function payload(overrides: Record<string, unknown> = {}) {
  const n = randomUUID().slice(0, 8);
  return {
    employeeCode: `T-${n.toUpperCase()}`,
    firstName: "Asha",
    lastName: "Rao",
    email: `asha-${n}@example.com`,
    departmentId,
    designation: "Engineer",
    country: "IN",
    joiningDate: "2024-01-15",
    ...overrides,
  };
}

async function create(overrides: Record<string, unknown> = {}) {
  const response = await agent.post("/api/employees").send(payload(overrides));
  expect(response.status).toBe(201);
  return response.body.employee as { id: string; employeeCode: string; email: string };
}

beforeAll(async () => {
  await createTestUser(USER_EMAIL);
  departmentId = (await prisma.department.create({ data: { name: `Test Dept A ${SUFFIX}` } })).id;
  otherDepartmentId = (await prisma.department.create({ data: { name: `Test Dept B ${SUFFIX}` } })).id;
  agent = await loginAs(USER_EMAIL);
});

afterAll(async () => {
  await prisma.employee.deleteMany({ where: { departmentId: { in: [departmentId, otherDepartmentId] } } });
  await prisma.department.deleteMany({ where: { id: { in: [departmentId, otherDepartmentId] } } });
  await prisma.user.delete({ where: { email: USER_EMAIL } });
  await prisma.$disconnect();
});

describe("authentication and authorization", () => {
  it("returns 401 without a session cookie", async () => {
    expect((await request(app).get("/api/employees")).status).toBe(401);
    expect((await request(app).post("/api/employees").send(payload())).status).toBe(401);
    expect((await request(app).get(`/api/employees/${randomUUID()}`)).status).toBe(401);
    expect(
      (await request(app).patch(`/api/employees/${randomUUID()}/status`).send({ status: "INACTIVE" })).status,
    ).toBe(401);
  });

  it("returns 403 for a role that is not allowed", async () => {
    const response = await request(app).get("/api/employees").set("Cookie", forgedCookie("VIEWER"));
    expect(response.status).toBe(403);
  });
});

describe("POST /api/employees", () => {
  it("creates an employee and normalises fields", async () => {
    const response = await agent.post("/api/employees").send(
      payload({
        employeeCode: ` t-norm-${SUFFIX} `,
        email: `  Norm.${SUFFIX}@Example.COM `,
      }),
    );
    expect(response.status).toBe(201);
    expect(response.body.employee).toMatchObject({
      employeeCode: `T-NORM-${SUFFIX.toUpperCase()}`,
      email: `norm.${SUFFIX}@example.com`,
      phone: null,
      status: "ACTIVE",
      joiningDate: "2024-01-15",
      country: "IN",
      department: { id: departmentId, name: `Test Dept A ${SUFFIX}` },
    });
    expect(response.body.employee.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects a body with missing fields with 400", async () => {
    const response = await agent.post("/api/employees").send({});
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it.each([
    ["bad email", { email: "nope" }],
    ["future joining date", { joiningDate: "2999-01-01" }],
    ["impossible date", { joiningDate: "2024-02-30" }],
    ["unsupported country", { country: "ZZ" }],
    ["non-uuid department", { departmentId: "123" }],
  ])("rejects %s with 400", async (_name, bad) => {
    const response = await agent.post("/api/employees").send(payload(bad));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 INVALID_DEPARTMENT for an unknown department", async () => {
    const response = await agent.post("/api/employees").send(payload({ departmentId: randomUUID() }));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_DEPARTMENT");
  });

  it("returns 409 DUPLICATE_EMPLOYEE_CODE", async () => {
    const existing = await create();
    const response = await agent.post("/api/employees").send(payload({ employeeCode: existing.employeeCode.toLowerCase() }));
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("DUPLICATE_EMPLOYEE_CODE");
  });

  it("returns 409 DUPLICATE_EMAIL ignoring case and whitespace", async () => {
    const existing = await create();
    const response = await agent
      .post("/api/employees")
      .send(payload({ email: `  ${existing.email.toUpperCase()} ` }));
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("DUPLICATE_EMAIL");
  });
});

describe("GET /api/employees/:id", () => {
  it("returns the employee with its department", async () => {
    const created = await create();
    const response = await agent.get(`/api/employees/${created.id}`);
    expect(response.status).toBe(200);
    expect(response.body.employee.employeeCode).toBe(created.employeeCode);
    expect(response.body.employee.department.id).toBe(departmentId);
  });

  it("returns 404 for a missing employee and 400 for a malformed id", async () => {
    const missing = await agent.get(`/api/employees/${randomUUID()}`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("EMPLOYEE_NOT_FOUND");
    expect((await agent.get("/api/employees/abc")).status).toBe(400);
  });
});

describe("PATCH /api/employees/:id", () => {
  it("updates only the supplied fields", async () => {
    const created = await create({ phone: "+91 98765 43210" });
    const response = await agent
      .patch(`/api/employees/${created.id}`)
      .send({ designation: "Staff Engineer", departmentId: otherDepartmentId, country: "US" });
    expect(response.status).toBe(200);
    expect(response.body.employee).toMatchObject({
      designation: "Staff Engineer",
      country: "US",
      department: { id: otherDepartmentId },
      firstName: "Asha",
      phone: "+91 98765 43210",
      employeeCode: created.employeeCode,
    });
  });

  it("clears the phone with an empty string", async () => {
    const created = await create({ phone: "+91 98765 43210" });
    const response = await agent.patch(`/api/employees/${created.id}`).send({ phone: "" });
    expect(response.status).toBe(200);
    expect(response.body.employee.phone).toBeNull();
  });

  it("keeps the same email without conflict and rejects another employee's email", async () => {
    const first = await create();
    const second = await create();
    expect((await agent.patch(`/api/employees/${first.id}`).send({ email: first.email.toUpperCase() })).status).toBe(200);
    const conflict = await agent.patch(`/api/employees/${second.id}`).send({ email: first.email });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("DUPLICATE_EMAIL");
  });

  it("rejects employeeCode, status, blank values and an empty body with 400", async () => {
    const created = await create();
    for (const body of [{ employeeCode: "NEW-1" }, { status: "INACTIVE" }, { designation: "" }, {}]) {
      const response = await agent.patch(`/api/employees/${created.id}`).send(body);
      expect(response.status).toBe(400);
    }
    const unchanged = await agent.get(`/api/employees/${created.id}`);
    expect(unchanged.body.employee.employeeCode).toBe(created.employeeCode);
  });

  it("returns 400 INVALID_DEPARTMENT, 404 and 400 for bad id", async () => {
    const created = await create();
    const badDept = await agent.patch(`/api/employees/${created.id}`).send({ departmentId: randomUUID() });
    expect(badDept.status).toBe(400);
    expect(badDept.body.error.code).toBe("INVALID_DEPARTMENT");
    expect((await agent.patch(`/api/employees/${randomUUID()}`).send({ designation: "X" })).status).toBe(404);
    expect((await agent.patch("/api/employees/abc").send({ designation: "X" })).status).toBe(400);
  });
});

describe("PATCH /api/employees/:id/status", () => {
  it("deactivates and reactivates while keeping the record, and is idempotent", async () => {
    const created = await create();

    const off = await agent.patch(`/api/employees/${created.id}/status`).send({ status: "INACTIVE" });
    expect(off.status).toBe(200);
    expect(off.body.employee.status).toBe("INACTIVE");
    expect(off.body.employee.firstName).toBe("Asha");

    const offAgain = await agent.patch(`/api/employees/${created.id}/status`).send({ status: "INACTIVE" });
    expect(offAgain.status).toBe(200);

    // inactive employees can still be read and edited
    expect((await agent.get(`/api/employees/${created.id}`)).body.employee.status).toBe("INACTIVE");
    const edited = await agent.patch(`/api/employees/${created.id}`).send({ designation: "Consultant" });
    expect(edited.status).toBe(200);
    expect(edited.body.employee.status).toBe("INACTIVE");

    const on = await agent.patch(`/api/employees/${created.id}/status`).send({ status: "ACTIVE" });
    expect(on.body.employee.status).toBe("ACTIVE");
  });

  it("returns 400 for an invalid status, 404 for a missing employee", async () => {
    const created = await create();
    expect((await agent.patch(`/api/employees/${created.id}/status`).send({ status: "FIRED" })).status).toBe(400);
    expect((await agent.patch(`/api/employees/${randomUUID()}/status`).send({ status: "ACTIVE" })).status).toBe(404);
  });
});
```

And `backend/src/modules/departments/departments.routes.test.ts`:

```ts
import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../app";
import { prisma } from "../../lib/prisma";
import { createTestUser, loginAs } from "../../test/helpers";

const SUFFIX = randomUUID().slice(0, 8);
const USER_EMAIL = `dept-routes-${SUFFIX}@example.com`;

beforeAll(async () => {
  await createTestUser(USER_EMAIL);
  await prisma.department.create({ data: { name: `AAA Test Dept ${SUFFIX}` } });
});

afterAll(async () => {
  await prisma.department.deleteMany({ where: { name: `AAA Test Dept ${SUFFIX}` } });
  await prisma.user.delete({ where: { email: USER_EMAIL } });
  await prisma.$disconnect();
});

describe("GET /api/departments", () => {
  it("requires authentication", async () => {
    expect((await request(app).get("/api/departments")).status).toBe(401);
  });

  it("lists departments sorted by name", async () => {
    const agent = await loginAs(USER_EMAIL);
    const response = await agent.get("/api/departments");
    expect(response.status).toBe(200);
    const names = (response.body.departments as { id: string; name: string }[]).map((d) => d.name);
    expect(names).toContain(`AAA Test Dept ${SUFFIX}`);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(Object.keys(response.body.departments[0]).sort()).toEqual(["id", "name"]);
  });
});
```

(If `localeCompare` ordering differs from Postgres collation for the seeded names, compare only the test department's position relative to a seeded one, or assert it appears before "Engineering".)

- [ ] **Step 3: Run to verify they fail**

Run: `cd backend && bunx vitest run src/modules/employees/employee.routes.test.ts src/modules/departments`
Expected: FAIL (404s / missing modules).

- [ ] **Step 4: Implement the service** `backend/src/modules/employees/employee.service.ts`

```ts
import type { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import { AppError } from "../../middleware/error.middleware.ts";
import type {
  CreateEmployeeInput,
  EmployeeStatusValue,
  UpdateEmployeeInput,
} from "./employee.schema.ts";

export const employeeInclude = { department: { select: { id: true, name: true } } } as const;

type EmployeeRow = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;

export function serializeEmployee(employee: EmployeeRow) {
  return {
    id: employee.id,
    employeeCode: employee.employeeCode,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    phone: employee.phone,
    departmentId: employee.departmentId,
    department: employee.department,
    designation: employee.designation,
    country: employee.country,
    joiningDate: employee.joiningDate.toISOString().slice(0, 10),
    status: employee.status,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
}

export type EmployeeDto = ReturnType<typeof serializeEmployee>;

const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

function prismaCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

const employeeNotFound = () => new AppError(404, "Employee not found", "EMPLOYEE_NOT_FOUND");

async function assertDepartmentExists(departmentId: string) {
  const department = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!department) {
    throw new AppError(400, "Department not found", "INVALID_DEPARTMENT");
  }
}

// The driver adapter does not reliably report which constraint failed, so look at the data.
async function duplicateError(email: string | undefined, employeeCode: string | undefined, excludeId?: string) {
  if (employeeCode) {
    const byCode = await prisma.employee.findFirst({
      where: { employeeCode, ...(excludeId && { NOT: { id: excludeId } }) },
      select: { id: true },
    });
    if (byCode) return new AppError(409, "Employee ID already exists", "DUPLICATE_EMPLOYEE_CODE");
  }
  if (email) {
    const byEmail = await prisma.employee.findFirst({
      where: { email, ...(excludeId && { NOT: { id: excludeId } }) },
      select: { id: true },
    });
    if (byEmail) return new AppError(409, "Email already in use", "DUPLICATE_EMAIL");
  }
  return new AppError(409, "Employee already exists", "DUPLICATE_EMPLOYEE");
}

export async function createEmployee(input: CreateEmployeeInput): Promise<EmployeeDto> {
  await assertDepartmentExists(input.departmentId);

  try {
    const employee = await prisma.employee.create({
      data: { ...input, phone: input.phone ?? null, joiningDate: toDate(input.joiningDate) },
      include: employeeInclude,
    });
    return serializeEmployee(employee);
  } catch (error) {
    if (prismaCode(error) === "P2002") {
      throw await duplicateError(input.email, input.employeeCode);
    }
    throw error;
  }
}

export async function getEmployee(id: string): Promise<EmployeeDto> {
  const employee = await prisma.employee.findUnique({ where: { id }, include: employeeInclude });
  if (!employee) throw employeeNotFound();
  return serializeEmployee(employee);
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput): Promise<EmployeeDto> {
  if (input.departmentId) await assertDepartmentExists(input.departmentId);

  const { joiningDate, ...rest } = input;

  try {
    const employee = await prisma.employee.update({
      where: { id },
      data: { ...rest, ...(joiningDate && { joiningDate: toDate(joiningDate) }) },
      include: employeeInclude,
    });
    return serializeEmployee(employee);
  } catch (error) {
    const code = prismaCode(error);
    if (code === "P2025") throw employeeNotFound();
    if (code === "P2002") throw await duplicateError(input.email, undefined, id);
    throw error;
  }
}

export async function setEmployeeStatus(id: string, status: EmployeeStatusValue): Promise<EmployeeDto> {
  try {
    const employee = await prisma.employee.update({
      where: { id },
      data: { status },
      include: employeeInclude,
    });
    return serializeEmployee(employee);
  } catch (error) {
    if (prismaCode(error) === "P2025") throw employeeNotFound();
    throw error;
  }
}
```

If `import type { Prisma }` from `generated/prisma/client.ts` does not resolve, inspect that file for the namespace export and adjust the import (do not add a dependency).

- [ ] **Step 5: Controller, routes, departments, mount**

`employee.controller.ts`:

```ts
import type { Request, Response } from "express";

import {
  createEmployeeSchema,
  idParamSchema,
  statusSchema,
  updateEmployeeSchema,
} from "./employee.schema.ts";
import {
  createEmployee,
  getEmployee,
  setEmployeeStatus,
  updateEmployee,
} from "./employee.service.ts";

export async function createEmployeeHandler(request: Request, response: Response) {
  const input = createEmployeeSchema.parse(request.body);
  const employee = await createEmployee(input);
  response.status(201).json({ employee });
}

export async function getEmployeeHandler(request: Request, response: Response) {
  const { id } = idParamSchema.parse(request.params);
  response.status(200).json({ employee: await getEmployee(id) });
}

export async function updateEmployeeHandler(request: Request, response: Response) {
  const { id } = idParamSchema.parse(request.params);
  const input = updateEmployeeSchema.parse(request.body);
  response.status(200).json({ employee: await updateEmployee(id, input) });
}

export async function setEmployeeStatusHandler(request: Request, response: Response) {
  const { id } = idParamSchema.parse(request.params);
  const { status } = statusSchema.parse(request.body);
  response.status(200).json({ employee: await setEmployeeStatus(id, status) });
}
```

`employee.routes.ts`:

```ts
import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.ts";
import {
  createEmployeeHandler,
  getEmployeeHandler,
  setEmployeeStatusHandler,
  updateEmployeeHandler,
} from "./employee.controller.ts";

export const employeeRouter = Router();

employeeRouter.use(requireAuth, requireRole("ADMIN", "HR_MANAGER"));

employeeRouter.post("/", createEmployeeHandler);
employeeRouter.get("/:id", getEmployeeHandler);
employeeRouter.patch("/:id", updateEmployeeHandler);
employeeRouter.patch("/:id/status", setEmployeeStatusHandler);
```

`modules/departments/department.service.ts`:

```ts
import { prisma } from "../../lib/prisma.ts";

export function listDepartments() {
  return prisma.department.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
```

`department.controller.ts`:

```ts
import type { Request, Response } from "express";

import { listDepartments } from "./department.service.ts";

export async function listDepartmentsHandler(_request: Request, response: Response) {
  response.status(200).json({ departments: await listDepartments() });
}
```

`department.routes.ts`:

```ts
import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.ts";
import { listDepartmentsHandler } from "./department.controller.ts";

export const departmentRouter = Router();

departmentRouter.use(requireAuth, requireRole("ADMIN", "HR_MANAGER"));
departmentRouter.get("/", listDepartmentsHandler);
```

`app.ts`: add imports and mount after the auth router:

```ts
import { departmentRouter } from "./modules/departments/department.routes.ts";
import { employeeRouter } from "./modules/employees/employee.routes.ts";
...
app.use("/api/auth", authRouter);
app.use("/api/employees", employeeRouter);
app.use("/api/departments", departmentRouter);
```

Note: `GET /api/employees` (list) is added in Task 4; until then the 401/403 tests hit a missing route behind the router's auth middleware... `router.use(requireAuth…)` runs for any path under `/api/employees`, so 401/403 still occur. Good.

- [ ] **Step 6: Run to verify they pass**

Run: `cd backend && bunx vitest run src/modules/employees src/modules/departments && bun run typecheck`
Expected: all PASS. Then full `bun run test`.

- [ ] **Step 7: Commit**

```bash
git add backend/src
git commit -m "feat(backend): add employee create/get/update/status and departments APIs"
```

---

### Task 4: Employee list API (search, filter, sort, pagination)

**Files:**
- Modify: `backend/src/modules/employees/employee.service.ts`, `employee.controller.ts`, `employee.routes.ts`
- Test: `backend/src/modules/employees/employee.list.test.ts`

**Interfaces:**
- Consumes: `listEmployeesQuerySchema`, `ListEmployeesQuery`, `serializeEmployee`, `employeeInclude`.
- Produces: `listEmployees(query: ListEmployeesQuery): Promise<{ data: EmployeeDto[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }>`; route `GET /api/employees`.

- [ ] **Step 1: Write the failing test** `employee.list.test.ts`

```ts
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/prisma";
import { createTestUser, loginAs } from "../../test/helpers";

const SUFFIX = randomUUID().slice(0, 8);
const USER_EMAIL = `emp-list-${SUFFIX}@example.com`;
const P = `L${SUFFIX.toUpperCase()}`; // code prefix unique to this run

let deptA: string;
let deptB: string;
let agent: Awaited<ReturnType<typeof loginAs>>;

const date = (s: string) => new Date(`${s}T00:00:00.000Z`);

beforeAll(async () => {
  await createTestUser(USER_EMAIL);
  deptA = (await prisma.department.create({ data: { name: `List Dept A ${SUFFIX}` } })).id;
  deptB = (await prisma.department.create({ data: { name: `List Dept B ${SUFFIX}` } })).id;

  const rows = [
    { n: "001", first: "Asha", last: "Rao", dept: deptA, country: "IN", joined: "2020-01-01", status: "ACTIVE" as const, designation: "Engineer" },
    { n: "002", first: "John", last: "Smith", dept: deptA, country: "US", joined: "2021-02-01", status: "ACTIVE" as const, designation: "Analyst" },
    { n: "003", first: "Emma", last: "Wilson", dept: deptA, country: "US", joined: "2019-03-01", status: "INACTIVE" as const, designation: "Manager" },
    { n: "004", first: "Zed", last: "Adams", dept: deptA, country: "IN", joined: "2022-04-01", status: "ACTIVE" as const, designation: "Engineer" },
    { n: "005", first: "Maria", last: "Garcia", dept: deptA, country: "ES", joined: "2023-05-01", status: "ACTIVE" as const, designation: "Designer" },
    { n: "006", first: "Lars", last: "Meyer", dept: deptB, country: "DE", joined: "2018-06-01", status: "ACTIVE" as const, designation: "Sales Rep" },
    { n: "007", first: "Mei", last: "Tan", dept: deptB, country: "SG", joined: "2017-07-01", status: "INACTIVE" as const, designation: "Lead" },
  ];
  await prisma.employee.createMany({
    data: rows.map((r) => ({
      employeeCode: `${P}-${r.n}`,
      firstName: r.first,
      lastName: r.last,
      email: `${r.first}.${r.last}.${SUFFIX}@example.com`.toLowerCase(),
      departmentId: r.dept,
      designation: r.designation,
      country: r.country,
      joiningDate: date(r.joined),
      status: r.status,
    })),
  });
  agent = await loginAs(USER_EMAIL);
});

afterAll(async () => {
  await prisma.employee.deleteMany({ where: { departmentId: { in: [deptA, deptB] } } });
  await prisma.department.deleteMany({ where: { id: { in: [deptA, deptB] } } });
  await prisma.user.delete({ where: { email: USER_EMAIL } });
  await prisma.$disconnect();
});

const list = (query: Record<string, string | number>) =>
  agent.get("/api/employees").query({ departmentId: deptA, ...query });
const codes = (body: { data: { employeeCode: string }[] }) => body.data.map((e) => e.employeeCode.slice(-3));

describe("GET /api/employees", () => {
  it("returns data with pagination metadata", async () => {
    const response = await list({});
    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({ page: 1, pageSize: 20, total: 5, totalPages: 1 });
    expect(codes(response.body)).toEqual(["001", "002", "003", "004", "005"]);
    expect(response.body.data[0]).toMatchObject({ department: { name: `List Dept A ${SUFFIX}` }, joiningDate: "2020-01-01" });
  });

  it("paginates without overlap and keeps order stable", async () => {
    const p1 = await list({ pageSize: 2, page: 1 });
    const p2 = await list({ pageSize: 2, page: 2 });
    const p3 = await list({ pageSize: 2, page: 3 });
    expect(p1.body.pagination).toEqual({ page: 1, pageSize: 2, total: 5, totalPages: 3 });
    expect([...codes(p1.body), ...codes(p2.body), ...codes(p3.body)]).toEqual(["001", "002", "003", "004", "005"]);
  });

  it("returns an empty page, not an error, beyond the last page", async () => {
    const response = await list({ pageSize: 2, page: 99 });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.pagination.total).toBe(5);
  });

  it("filters by status, including inactive employees", async () => {
    expect(codes((await list({ status: "INACTIVE" })).body)).toEqual(["003"]);
    expect(codes((await list({ status: "ACTIVE" })).body)).toEqual(["001", "002", "004", "005"]);
  });

  it("filters by country and department", async () => {
    expect(codes((await list({ country: "US" })).body)).toEqual(["002", "003"]);
    const other = await agent.get("/api/employees").query({ departmentId: deptB });
    expect(codes(other.body)).toEqual(["006", "007"]);
  });

  it("searches by code, first name, last name, full name and email, case-insensitively", async () => {
    expect(codes((await list({ q: `${P}-003` })).body)).toEqual(["003"]);
    expect(codes((await list({ q: `${P.toLowerCase()}-003` })).body)).toEqual(["003"]);
    expect(codes((await list({ q: "asha" })).body)).toEqual(["001"]);
    expect(codes((await list({ q: "WILSON" })).body)).toEqual(["003"]);
    expect(codes((await list({ q: "john smith" })).body)).toEqual(["002"]);
    expect(codes((await list({ q: "smith john" })).body)).toEqual(["002"]);
    expect(codes((await list({ q: `maria.garcia.${SUFFIX}` })).body)).toEqual(["005"]);
  });

  it("combines search with filters", async () => {
    expect(codes((await list({ q: "a", country: "IN" })).body)).toEqual(["001", "004"]);
    expect((await list({ q: "asha", country: "US" })).body.data).toEqual([]);
  });

  it("treats % and _ in the search text literally", async () => {
    expect((await list({ q: "%" })).body.data).toEqual([]);
    expect((await list({ q: "_" })).body.data).toEqual([]);
  });

  it("sorts by name, joining date, department and status in both directions", async () => {
    expect(codes((await list({ sortBy: "name", sortOrder: "asc" })).body)).toEqual(["004", "005", "001", "002", "003"]);
    expect(codes((await list({ sortBy: "name", sortOrder: "desc" })).body)).toEqual(["003", "002", "001", "005", "004"]);
    expect(codes((await list({ sortBy: "joiningDate", sortOrder: "desc" })).body)).toEqual(["005", "004", "002", "001", "003"]);
    const statusAsc = (await list({ sortBy: "status", sortOrder: "asc" })).body.data;
    expect(statusAsc.at(-1).status).toBe("INACTIVE");
    const statusDesc = (await list({ sortBy: "status", sortOrder: "desc" })).body.data;
    expect(statusDesc[0].status).toBe("INACTIVE");
    const byDept = await agent
      .get("/api/employees")
      .query({ q: P, sortBy: "department", sortOrder: "desc" });
    expect(codes(byDept.body).slice(0, 2).sort()).toEqual(["006", "007"]);
  });

  it.each([
    { sortBy: "passwordHash" },
    { pageSize: 1000 },
    { page: 0 },
    { status: "FIRED" },
    { country: "ZZ" },
    { unknown: "1" },
  ])("rejects invalid query %o with 400", async (bad) => {
    expect((await list(bad)).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && bunx vitest run src/modules/employees/employee.list.test.ts`
Expected: FAIL (404 on GET /api/employees).

- [ ] **Step 3: Implement** — append to `employee.service.ts`

```ts
import type { ListEmployeesQuery, SortField } from "./employee.schema.ts";
```
(merge with the existing schema import), then:

```ts
const contains = (token: string) => ({ contains: token, mode: "insensitive" as const });

function buildOrderBy(
  sortBy: SortField,
  sortOrder: "asc" | "desc",
): Prisma.EmployeeOrderByWithRelationInput[] {
  switch (sortBy) {
    case "name":
      return [{ lastName: sortOrder }, { firstName: sortOrder }, { id: "asc" }];
    case "department":
      return [{ department: { name: sortOrder } }, { id: "asc" }];
    default:
      return [{ [sortBy]: sortOrder } as Prisma.EmployeeOrderByWithRelationInput, { id: "asc" }];
  }
}

export async function listEmployees(query: ListEmployeesQuery) {
  const { page, pageSize, q, departmentId, country, status, sortBy, sortOrder } = query;
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];

  const where: Prisma.EmployeeWhereInput = {
    ...(departmentId && { departmentId }),
    ...(country && { country }),
    ...(status && { status }),
    ...(tokens.length > 0 && {
      // every token must match at least one searchable field ("john smith" == "smith john")
      AND: tokens.map((token) => ({
        OR: [
          { employeeCode: contains(token) },
          { firstName: contains(token) },
          { lastName: contains(token) },
          { email: contains(token) },
        ],
      })),
    }),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where,
      orderBy: buildOrderBy(sortBy, sortOrder),
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: employeeInclude,
    }),
  ]);

  return {
    data: rows.map(serializeEmployee),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}
```

Controller addition:

```ts
import { listEmployeesQuerySchema } from "./employee.schema.ts";   // merge into the existing import
import { listEmployees } from "./employee.service.ts";             // merge into the existing import

export async function listEmployeesHandler(request: Request, response: Response) {
  const query = listEmployeesQuerySchema.parse(request.query);
  response.status(200).json(await listEmployees(query));
}
```

Routes: `employeeRouter.get("/", listEmployeesHandler);` (import it; register before `/:id`).

If the `%`/`_` test fails (Prisma not escaping LIKE wildcards), do not weaken the test: escape the token with `token.replace(/[\\%_]/g, "\\$&")` and verify behavior again; if still wrong, report BLOCKED with the observed SQL behavior.

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && bunx vitest run src/modules/employees && bun run typecheck && bun run test`
Expected: PASS everywhere.

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "feat(backend): add employee list API with search, filters, sorting and pagination"
```

---

### Task 5: Frontend shared pieces (API helper, countries, form schema, StatusChip, ConfirmDialog)

**Files:**
- Modify: `frontend/app/lib/api-client.ts`, `frontend/app/lib/api-client.test.ts`
- Create: `frontend/app/lib/countries.ts`, `employee-form.ts`, `employees-api.ts`
- Create: `frontend/app/components/common/StatusChip.tsx`, `ConfirmDialog.tsx`
- Test: `frontend/app/lib/employees-api.test.ts`, `frontend/app/lib/employee-form.test.ts`, `frontend/app/components/common/ConfirmDialog.test.tsx`, `StatusChip.test.tsx`

**Interfaces:**
- Produces `apiFetchAs(request: Request, path: string, init?: RequestInit): Promise<Response>` — `apiFetch` with the incoming `cookie` header forwarded.
- Produces from `employees-api.ts`:
  - types `EmployeeStatus`, `SortField`, `SortOrder`, `Employee`, `Department`, `Pagination`, `ListParams`, `EmployeeInput`, `ApiResult<T>`, `FormError`
  - consts `SORT_FIELDS`, `PAGE_SIZES`, `DEFAULT_LIST_PARAMS`
  - `parseListParams(searchParams: URLSearchParams): ListParams`, `toSearchParams(params: Partial<ListParams>): URLSearchParams`
  - `listEmployees(request, params)`, `listDepartments(request)`, `getEmployee(request, id)`, `createEmployee(request, input)`, `updateEmployee(request, id, input)`, `setEmployeeStatus(request, id, status)` — all `Promise<ApiResult<…>>`; a 401 response throws `redirect("/login")`
  - `toFormError(result: Extract<ApiResult<unknown>, {ok:false}>): FormError`
- Produces `COUNTRIES: {code,name}[]`, `countryName(code: string): string`.
- Produces `employeeFormSchema`, `EmployeeFormValues`, `localToday()`.
- Produces `<StatusChip status />`, `<ConfirmDialog open title message confirmLabel onConfirm onCancel loading? />`.

- [ ] **Step 1: Write failing tests**

Append to `api-client.test.ts` (match its existing style; add imports if missing):

```ts
describe("apiFetchAs", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("forwards the incoming cookie header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetchAs(new Request("http://localhost:3000/x", { headers: { cookie: "session=abc" } }), "/api/employees");

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).cookie).toBe("session=abc");
  });

  it("sends no cookie header when the request has none", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetchAs(new Request("http://localhost:3000/x"), "/api/employees");

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).cookie).toBeUndefined();
  });
});
```

`employees-api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_LIST_PARAMS,
  createEmployee,
  getEmployee,
  listEmployees,
  parseListParams,
  setEmployeeStatus,
  toFormError,
  toSearchParams,
} from "./employees-api";

const req = () => new Request("http://localhost:3000/employees", { headers: { cookie: "session=abc" } });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("parseListParams", () => {
  it("returns defaults for an empty query", () => {
    expect(parseListParams(new URLSearchParams())).toEqual(DEFAULT_LIST_PARAMS);
  });

  it("parses valid values", () => {
    const params = parseListParams(
      new URLSearchParams("page=3&pageSize=50&q=%20asha%20&country=IN&status=INACTIVE&sortBy=name&sortOrder=desc"),
    );
    expect(params).toMatchObject({ page: 3, pageSize: 50, q: "asha", country: "IN", status: "INACTIVE", sortBy: "name", sortOrder: "desc" });
  });

  it("falls back to defaults for tampered values", () => {
    const params = parseListParams(
      new URLSearchParams("page=-4&pageSize=9999&country=ZZ&status=FIRED&sortBy=passwordHash&sortOrder=up&departmentId=nope"),
    );
    expect(params).toEqual(DEFAULT_LIST_PARAMS);
    expect(parseListParams(new URLSearchParams("page=abc")).page).toBe(1);
  });
});

describe("toSearchParams", () => {
  it("omits empty values and defaults", () => {
    expect(toSearchParams(DEFAULT_LIST_PARAMS).toString()).toBe("");
    expect(toSearchParams({ ...DEFAULT_LIST_PARAMS, q: "asha", page: 2, sortBy: "name" }).toString()).toBe(
      "page=2&q=asha&sortBy=name",
    );
  });
});

describe("api calls", () => {
  it("lists employees with the query string and forwarded cookie", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listEmployees(req(), { ...DEFAULT_LIST_PARAMS, q: "asha" });

    expect(result.ok).toBe(true);
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/\/api\/employees\?q=asha$/);
    expect(((fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>).cookie).toBe("session=abc");
  });

  it("throws a redirect to /login on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { message: "Unauthorized" } }, 401)));

    const thrown = await getEmployee(req(), "1").catch((e) => e);

    expect(thrown).toBeInstanceOf(Response);
    expect(thrown.status).toBe(302);
    expect(thrown.headers.get("Location")).toBe("/login");
  });

  it("returns a failure result with code and message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ error: { message: "Email already in use", code: "DUPLICATE_EMAIL" } }, 409)),
    );

    const result = await createEmployee(req(), {} as never);

    expect(result).toEqual({ ok: false, status: 409, code: "DUPLICATE_EMAIL", message: "Email already in use" });
  });

  it("survives a non-JSON error body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));

    expect(await setEmployeeStatus(req(), "1", "INACTIVE")).toEqual({
      ok: false,
      status: 500,
      code: undefined,
      message: "Request failed",
    });
  });
});

describe("toFormError", () => {
  it.each([
    ["DUPLICATE_EMPLOYEE_CODE", "employeeCode"],
    ["DUPLICATE_EMAIL", "email"],
    ["INVALID_DEPARTMENT", "departmentId"],
  ])("maps %s to the %s field", (code, field) => {
    expect(toFormError({ ok: false, status: 409, code, message: "m" })).toEqual({ message: "m", field });
  });

  it("leaves other errors without a field", () => {
    expect(toFormError({ ok: false, status: 500, message: "m" })).toEqual({ message: "m" });
  });
});
```

`employee-form.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { employeeFormSchema, localToday } from "./employee-form";

const valid = {
  employeeCode: "emp-1",
  firstName: "Asha",
  lastName: "Rao",
  email: "asha@example.com",
  phone: "",
  departmentId: "d1",
  designation: "Engineer",
  country: "IN",
  joiningDate: "2024-01-15",
};

describe("employeeFormSchema", () => {
  it("accepts a valid form with an empty phone", () => {
    expect(employeeFormSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["employeeCode", ""],
    ["firstName", "  "],
    ["email", "nope"],
    ["phone", "abc"],
    ["departmentId", ""],
    ["country", ""],
    ["joiningDate", ""],
    ["joiningDate", "2999-01-01"],
  ])("rejects an invalid %s (%j)", (field, value) => {
    const result = employeeFormSchema.safeParse({ ...valid, [field]: value });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]!.path[0]).toBe(field);
  });

  it("accepts today", () => {
    expect(employeeFormSchema.safeParse({ ...valid, joiningDate: localToday() }).success).toBe(true);
  });
});
```

`ConfirmDialog.test.tsx` and `StatusChip.test.tsx`:

```tsx
// ConfirmDialog.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ConfirmDialog from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("shows the message and calls the handlers", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open title="Deactivate?" message="They stay in the directory." confirmLabel="Deactivate" onConfirm={onConfirm} onCancel={onCancel} />,
    );

    expect(screen.getByRole("dialog", { name: "Deactivate?" })).toBeInTheDocument();
    expect(screen.getByText("They stay in the directory.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons while loading and renders nothing when closed", () => {
    const { rerender } = render(
      <ConfirmDialog open loading title="T" message="M" confirmLabel="Go" onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Go" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    rerender(<ConfirmDialog open={false} title="T" message="M" confirmLabel="Go" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
```

```tsx
// StatusChip.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import StatusChip from "./StatusChip";

describe("StatusChip", () => {
  it("labels active and inactive employees", () => {
    const { rerender } = render(<StatusChip status="ACTIVE" />);
    expect(screen.getByText("Active")).toBeInTheDocument();
    rerender(<StatusChip status="INACTIVE" />);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && bunx vitest run app/lib app/components/common`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`api-client.ts` — append:

```ts
/** apiFetch for SSR loaders/actions: forwards the incoming request's cookie to the backend. */
export function apiFetchAs(request: Request, path: string, init: RequestInit = {}): Promise<Response> {
  const cookie = request.headers.get("cookie");
  return apiFetch(path, {
    ...init,
    headers: { ...(cookie ? { cookie } : {}), ...init.headers },
  });
}
```

`countries.ts` (names for the 21 codes; keep in sync with `backend/src/lib/countries.ts`):

```ts
export const COUNTRIES = [
  { code: "AE", name: "United Arab Emirates" },
  { code: "AU", name: "Australia" },
  { code: "BR", name: "Brazil" },
  { code: "CA", name: "Canada" },
  { code: "CH", name: "Switzerland" },
  { code: "CN", name: "China" },
  { code: "DE", name: "Germany" },
  { code: "ES", name: "Spain" },
  { code: "FR", name: "France" },
  { code: "GB", name: "United Kingdom" },
  { code: "IE", name: "Ireland" },
  { code: "IN", name: "India" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "MX", name: "Mexico" },
  { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" },
  { code: "SE", name: "Sweden" },
  { code: "SG", name: "Singapore" },
  { code: "US", name: "United States" },
  { code: "ZA", name: "South Africa" },
] as const;

export function countryName(code: string): string {
  return COUNTRIES.find((country) => country.code === code)?.name ?? code;
}
```

`employee-form.ts`:

```ts
import { z } from "zod";

export function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export const employeeFormSchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .min(1, "Employee ID is required")
    .max(32, "Employee ID must be 32 characters or fewer")
    .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, - or _"),
  firstName: z.string().trim().min(1, "First name is required").max(100, "Too long"),
  lastName: z.string().trim().min(1, "Last name is required").max(100, "Too long"),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email").max(254, "Too long"),
  phone: z
    .string()
    .trim()
    .refine((value) => value === "" || /^[0-9+\-() ]{7,20}$/.test(value), "Enter a valid phone number"),
  departmentId: z.string().min(1, "Select a department"),
  designation: z.string().trim().min(1, "Designation is required").max(100, "Too long"),
  country: z.string().min(1, "Select a country"),
  joiningDate: z
    .string()
    .min(1, "Joining date is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
    .refine((value) => value <= localToday(), "Joining date cannot be in the future"),
});

export type EmployeeFormValues = z.infer<typeof employeeFormSchema>;
```

`employees-api.ts`:

```ts
import { redirect } from "react-router";

import { apiFetchAs } from "~/lib/api-client";
import { COUNTRIES } from "~/lib/countries";
import type { EmployeeFormValues } from "~/lib/employee-form";

export type EmployeeStatus = "ACTIVE" | "INACTIVE";
export const SORT_FIELDS = [
  "employeeCode",
  "name",
  "department",
  "designation",
  "country",
  "joiningDate",
  "status",
] as const;
export type SortField = (typeof SORT_FIELDS)[number];
export type SortOrder = "asc" | "desc";
export const PAGE_SIZES = [10, 20, 50] as const;

export interface Department {
  id: string;
  name: string;
}

export interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  departmentId: string;
  department: Department;
  designation: string;
  country: string;
  joiningDate: string;
  status: EmployeeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListParams {
  page: number;
  pageSize: number;
  q: string;
  departmentId: string;
  country: string;
  status: "" | EmployeeStatus;
  sortBy: SortField;
  sortOrder: SortOrder;
}

export const DEFAULT_LIST_PARAMS: ListParams = {
  page: 1,
  pageSize: 20,
  q: "",
  departmentId: "",
  country: "",
  status: "",
  sortBy: "employeeCode",
  sortOrder: "asc",
};

export type EmployeeInput = EmployeeFormValues;

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code?: string; message: string };

export interface FormError {
  message: string;
  field?: "employeeCode" | "email" | "departmentId";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads list state from the URL; anything invalid falls back to the default. */
export function parseListParams(searchParams: URLSearchParams): ListParams {
  const page = Number(searchParams.get("page"));
  const pageSize = Number(searchParams.get("pageSize"));
  const country = searchParams.get("country") ?? "";
  const status = searchParams.get("status");
  const sortBy = searchParams.get("sortBy");
  const sortOrder = searchParams.get("sortOrder");
  const departmentId = searchParams.get("departmentId") ?? "";

  return {
    page: Number.isInteger(page) && page >= 1 ? page : DEFAULT_LIST_PARAMS.page,
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : DEFAULT_LIST_PARAMS.pageSize,
    q: (searchParams.get("q") ?? "").trim().slice(0, 100),
    departmentId: UUID.test(departmentId) ? departmentId : "",
    country: COUNTRIES.some((c) => c.code === country) ? country : "",
    status: status === "ACTIVE" || status === "INACTIVE" ? status : "",
    sortBy: (SORT_FIELDS as readonly string[]).includes(sortBy ?? "") ? (sortBy as SortField) : DEFAULT_LIST_PARAMS.sortBy,
    sortOrder: sortOrder === "asc" || sortOrder === "desc" ? sortOrder : DEFAULT_LIST_PARAMS.sortOrder,
  };
}

/** Serialises list state, omitting empty values and defaults (the backend defaults match). */
export function toSearchParams(params: Partial<ListParams>): URLSearchParams {
  const merged = { ...DEFAULT_LIST_PARAMS, ...params };
  const search = new URLSearchParams();
  for (const key of Object.keys(DEFAULT_LIST_PARAMS) as (keyof ListParams)[]) {
    const value = merged[key];
    if (value === "" || value === DEFAULT_LIST_PARAMS[key]) continue;
    search.set(key, String(value));
  }
  return search;
}

async function call<T>(request: Request, path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const response = await apiFetchAs(request, path, init);

  if (response.status === 401) throw redirect("/login");

  if (response.ok) return { ok: true, data: (await response.json()) as T };

  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string; code?: string };
  } | null;
  return {
    ok: false,
    status: response.status,
    code: body?.error?.code,
    message: body?.error?.message ?? "Request failed",
  };
}

export function listEmployees(request: Request, params: ListParams) {
  const query = toSearchParams(params).toString();
  return call<{ data: Employee[]; pagination: Pagination }>(
    request,
    `/api/employees${query ? `?${query}` : ""}`,
  );
}

export function listDepartments(request: Request) {
  return call<{ departments: Department[] }>(request, "/api/departments");
}

export function getEmployee(request: Request, id: string) {
  return call<{ employee: Employee }>(request, `/api/employees/${id}`);
}

export function createEmployee(request: Request, input: EmployeeInput) {
  return call<{ employee: Employee }>(request, "/api/employees", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateEmployee(request: Request, id: string, input: Partial<EmployeeInput>) {
  return call<{ employee: Employee }>(request, `/api/employees/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function setEmployeeStatus(request: Request, id: string, status: EmployeeStatus) {
  return call<{ employee: Employee }>(request, `/api/employees/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

const FIELD_BY_CODE: Record<string, NonNullable<FormError["field"]>> = {
  DUPLICATE_EMPLOYEE_CODE: "employeeCode",
  DUPLICATE_EMAIL: "email",
  INVALID_DEPARTMENT: "departmentId",
};

export function toFormError(result: Extract<ApiResult<unknown>, { ok: false }>): FormError {
  const field = result.code ? FIELD_BY_CODE[result.code] : undefined;
  return field ? { message: result.message, field } : { message: result.message };
}
```

`components/common/StatusChip.tsx`:

```tsx
import { Chip } from "@mui/material";

import type { EmployeeStatus } from "~/lib/employees-api";

export default function StatusChip({ status }: { status: EmployeeStatus }) {
  return (
    <Chip
      size="small"
      label={status === "ACTIVE" ? "Active" : "Inactive"}
      color={status === "ACTIVE" ? "success" : "default"}
      variant={status === "ACTIVE" ? "filled" : "outlined"}
    />
  );
}
```

`components/common/ConfirmDialog.tsx`:

```tsx
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@mui/material";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={loading ? undefined : onCancel} aria-labelledby="confirm-dialog-title">
      <DialogTitle id="confirm-dialog-title">{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={onConfirm} color="error" variant="contained" disabled={loading}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && bunx vitest run app/lib app/components/common && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/app
git commit -m "feat(frontend): add employee API helpers, form schema and shared components"
```

---

### Task 6: Employee directory (list route, table, filters)

**Files:**
- Create: `frontend/app/components/employees/EmployeeTable.tsx`, `EmployeeFilters.tsx`, `frontend/app/routes/employees.tsx`
- Modify: `frontend/app/routes.ts`, `frontend/app/routes.test.ts`
- Test: `EmployeeTable.test.tsx`, `EmployeeFilters.test.tsx`, `frontend/app/routes/employees.test.tsx`

**Interfaces:**
- Consumes: Task 5 exports.
- Produces: `<EmployeeTable employees sortBy sortOrder onSort />`, `<EmployeeFilters values departments onChange onClear />` where `values: Pick<ListParams,"q"|"departmentId"|"country"|"status">` and `onChange(patch: Partial<values>)`.
- Produces: routes `/employees` (this task), the rest are registered in later tasks.

- [ ] **Step 1: Write failing tests**

`EmployeeTable.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { Employee } from "~/lib/employees-api";
import EmployeeTable from "./EmployeeTable";

const employee = (overrides: Partial<Employee> = {}): Employee => ({
  id: "e1",
  employeeCode: "EMP-0001",
  firstName: "Asha",
  lastName: "Rao",
  email: "asha@example.com",
  phone: null,
  departmentId: "d1",
  department: { id: "d1", name: "Engineering" },
  designation: "Engineer",
  country: "IN",
  joiningDate: "2024-01-15",
  status: "ACTIVE",
  createdAt: "",
  updatedAt: "",
  ...overrides,
});

function renderTable(employees: Employee[], onSort = vi.fn()) {
  const router = createMemoryRouter([
    {
      path: "/",
      element: <EmployeeTable employees={employees} sortBy="employeeCode" sortOrder="asc" onSort={onSort} />,
    },
  ]);
  render(<RouterProvider router={router} />);
  return onSort;
}

describe("EmployeeTable", () => {
  it("shows the required columns and a profile link per row", () => {
    renderTable([employee(), employee({ id: "e2", employeeCode: "EMP-0002", firstName: "Mei", lastName: "Tan", status: "INACTIVE", country: "SG" })]);

    for (const name of ["Employee ID", "Name", "Department", "Designation", "Country", "Joined", "Status"]) {
      expect(screen.getByRole("columnheader", { name: new RegExp(name) })).toBeInTheDocument();
    }
    const row = screen.getByRole("row", { name: /EMP-0001/ });
    expect(within(row).getByRole("link", { name: "Asha Rao" })).toHaveAttribute("href", "/employees/e1");
    expect(within(row).getByText("India")).toBeInTheDocument();
    expect(within(row).getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("marks the active sort column and reports header clicks", async () => {
    const onSort = renderTable([employee()]);

    expect(screen.getByRole("columnheader", { name: /Employee ID/ })).toHaveAttribute("aria-sort", "ascending");
    await userEvent.click(screen.getByText("Name"));
    expect(onSort).toHaveBeenCalledWith("name");
  });
});
```

`EmployeeFilters.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import EmployeeFilters from "./EmployeeFilters";

const departments = [
  { id: "d1", name: "Engineering" },
  { id: "d2", name: "Finance" },
];
const empty = { q: "", departmentId: "", country: "", status: "" as const };

describe("EmployeeFilters", () => {
  it("debounces search input", async () => {
    const onChange = vi.fn();
    render(<EmployeeFilters values={empty} departments={departments} onChange={onChange} onClear={() => {}} />);

    await userEvent.type(screen.getByLabelText("Search"), "asha");

    expect(onChange).not.toHaveBeenCalledWith({ q: "a" });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ q: "asha" }), { timeout: 1500 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("reports department, country and status changes", async () => {
    const onChange = vi.fn();
    render(<EmployeeFilters values={empty} departments={departments} onChange={onChange} onClear={() => {}} />);

    await userEvent.selectOptions(screen.getByLabelText("Department"), "d2");
    expect(onChange).toHaveBeenLastCalledWith({ departmentId: "d2" });
    await userEvent.selectOptions(screen.getByLabelText("Country"), "IN");
    expect(onChange).toHaveBeenLastCalledWith({ country: "IN" });
    await userEvent.selectOptions(screen.getByLabelText("Status"), "INACTIVE");
    expect(onChange).toHaveBeenLastCalledWith({ status: "INACTIVE" });
  });

  it("offers Clear only when a filter is active", async () => {
    const onClear = vi.fn();
    const { rerender } = render(<EmployeeFilters values={empty} departments={departments} onChange={() => {}} onClear={onClear} />);
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();

    rerender(<EmployeeFilters values={{ ...empty, status: "ACTIVE" }} departments={departments} onChange={() => {}} onClear={onClear} />);
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalled();
  });
});
```

`routes/employees.test.tsx` (loader + component through a memory router with a mocked `fetch`):

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import Employees, { ErrorBoundary, loader } from "./employees";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const employee = (n: number) => ({
  id: `e${n}`,
  employeeCode: `EMP-000${n}`,
  firstName: "First" + n,
  lastName: "Last" + n,
  email: `e${n}@example.com`,
  phone: null,
  departmentId: "d1",
  department: { id: "d1", name: "Engineering" },
  designation: "Engineer",
  country: "IN",
  joiningDate: "2024-01-15",
  status: "ACTIVE",
  createdAt: "",
  updatedAt: "",
});

function stubBackend(handler: (url: URL) => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => handler(new URL(String(input)))),
  );
}

const departments = { departments: [{ id: "d1", name: "Engineering" }] };

function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/employees",
        loader: ({ request }) => loader({ request, params: {}, context: {} } as Parameters<typeof loader>[0]),
        Component: Employees,
        ErrorBoundary,
      },
      { path: "/login", Component: () => <div>login page</div> },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => vi.unstubAllGlobals());
```

Cases to write (each uses `stubBackend` + `renderAt`; `/api/departments` returns `departments`):

1. **Lists employees**: backend stub returns 2 employees for `/api/employees` and departments for `/api/departments`; render at `/employees`; expect `await screen.findByText("EMP-0001")`, heading "Employees", an "Add employee" link with `href="/employees/new"`, and the pagination text for "1–2 of 2".
2. **Passes URL params to the API**: render at `/employees?q=asha&status=INACTIVE&sortBy=name&sortOrder=desc&page=2`; assert the captured `/api/employees` URL has those search params (`q=asha`, `status=INACTIVE`, `sortBy=name`, `sortOrder=desc`, `page=2`).
3. **Tampered params**: render at `/employees?sortBy=passwordHash&pageSize=9999&status=FIRED`; assert the API URL has no `sortBy`, `pageSize` or `status` and the page renders.
4. **Empty (no filters)**: stub returns `data: []`, `total: 0`; expect "No employees yet" and an "Add employee" call to action.
5. **Empty (filters)**: render at `/employees?q=zzz`; stub returns empty; expect "No employees match your filters" and a "Clear filters" button; clicking it navigates to `/employees` (check `router.state.location.search === ""` via `waitFor`).
6. **Out-of-range page**: stub returns `data: []` with `total: 45, page: 9, pageSize: 20, totalPages: 3` for `page=9`; expect navigation to `?page=3` (`waitFor(() => expect(router.state.location.search).toContain("page=3"))`).
7. **Sort click**: click the "Name" header; expect the location search to contain `sortBy=name`.
8. **Backend failure**: stub returns 500 for `/api/employees`; expect the route ErrorBoundary text "Could not load employees" and a "Try again" link; no crash.
9. **Unauthenticated**: stub returns 401; expect navigation to `/login` (the loader throws a redirect; add a `/login` route stub `Component: () => <div>login page</div>` and assert it renders).

Also extend `routes.test.ts`:

```ts
  it("registers the employee routes under the authenticated layout", async () => {
    const config = await routes;
    const layout = config.find((r) => r.file === `${AUTHENTICATED_ROUTE_ID}.tsx`);
    const paths = layout?.children?.map((c) => c.path);
    expect(paths).toEqual(expect.arrayContaining(["employees", "employees/new", "employees/:id", "employees/:id/edit"]));
  });
```
(That assertion will fail until Task 8; mark the `new`, `:id`, `:id/edit` entries as added in the tasks that create those routes — i.e. in this task assert only `"employees"`, extend the array in Tasks 7 and 8.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && bunx vitest run app/components/employees app/routes/employees.test.tsx app/routes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`EmployeeTable.tsx`:

```tsx
import { Link as MuiLink, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel } from "@mui/material";
import { Link } from "react-router";

import StatusChip from "~/components/common/StatusChip";
import { countryName } from "~/lib/countries";
import type { Employee, SortField, SortOrder } from "~/lib/employees-api";

const COLUMNS: { field: SortField; label: string }[] = [
  { field: "employeeCode", label: "Employee ID" },
  { field: "name", label: "Name" },
  { field: "department", label: "Department" },
  { field: "designation", label: "Designation" },
  { field: "country", label: "Country" },
  { field: "joiningDate", label: "Joined" },
  { field: "status", label: "Status" },
];

interface EmployeeTableProps {
  employees: Employee[];
  sortBy: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
}

export default function EmployeeTable({ employees, sortBy, sortOrder, onSort }: EmployeeTableProps) {
  return (
    <TableContainer component={Paper} sx={{ overflowX: "auto" }}>
      <Table size="small" aria-label="Employees">
        <TableHead>
          <TableRow>
            {COLUMNS.map((column) => (
              <TableCell
                key={column.field}
                sortDirection={sortBy === column.field ? sortOrder : false}
              >
                <TableSortLabel
                  active={sortBy === column.field}
                  direction={sortBy === column.field ? sortOrder : "asc"}
                  onClick={() => onSort(column.field)}
                >
                  {column.label}
                </TableSortLabel>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {employees.map((employee) => (
            <TableRow key={employee.id} hover>
              <TableCell>{employee.employeeCode}</TableCell>
              <TableCell>
                <MuiLink component={Link} to={`/employees/${employee.id}`}>
                  {employee.firstName} {employee.lastName}
                </MuiLink>
              </TableCell>
              <TableCell>{employee.department.name}</TableCell>
              <TableCell>{employee.designation}</TableCell>
              <TableCell>{countryName(employee.country)}</TableCell>
              <TableCell>{employee.joiningDate}</TableCell>
              <TableCell>
                <StatusChip status={employee.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
```

`EmployeeFilters.tsx`:

```tsx
import { Box, Button, TextField } from "@mui/material";
import { useEffect, useState } from "react";

import { COUNTRIES } from "~/lib/countries";
import type { Department, ListParams } from "~/lib/employees-api";

type FilterValues = Pick<ListParams, "q" | "departmentId" | "country" | "status">;

interface EmployeeFiltersProps {
  values: FilterValues;
  departments: Department[];
  onChange: (patch: Partial<FilterValues>) => void;
  onClear: () => void;
}

const NATIVE_SELECT = { select: { native: true }, inputLabel: { shrink: true } } as const;

export default function EmployeeFilters({ values, departments, onChange, onClear }: EmployeeFiltersProps) {
  const [search, setSearch] = useState(values.q);

  // keep the box in sync when the URL changes (e.g. Clear filters)
  useEffect(() => setSearch(values.q), [values.q]);

  useEffect(() => {
    if (search === values.q) return;
    const timer = setTimeout(() => onChange({ q: search }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hasFilters = Boolean(values.q || values.departmentId || values.country || values.status);

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2, alignItems: "center" }}>
      <TextField
        id="employee-search"
        label="Search"
        placeholder="Name, employee ID or email"
        size="small"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        sx={{ minWidth: { xs: "100%", sm: 280 } }}
      />
      <TextField
        id="employee-department"
        select
        label="Department"
        size="small"
        value={values.departmentId}
        onChange={(event) => onChange({ departmentId: event.target.value })}
        slotProps={NATIVE_SELECT}
        sx={{ minWidth: 160 }}
      >
        <option value="">All</option>
        {departments.map((department) => (
          <option key={department.id} value={department.id}>
            {department.name}
          </option>
        ))}
      </TextField>
      <TextField
        id="employee-country"
        select
        label="Country"
        size="small"
        value={values.country}
        onChange={(event) => onChange({ country: event.target.value })}
        slotProps={NATIVE_SELECT}
        sx={{ minWidth: 160 }}
      >
        <option value="">All</option>
        {COUNTRIES.map((country) => (
          <option key={country.code} value={country.code}>
            {country.name}
          </option>
        ))}
      </TextField>
      <TextField
        id="employee-status"
        select
        label="Status"
        size="small"
        value={values.status}
        onChange={(event) => onChange({ status: event.target.value as FilterValues["status"] })}
        slotProps={NATIVE_SELECT}
        sx={{ minWidth: 130 }}
      >
        <option value="">All</option>
        <option value="ACTIVE">Active</option>
        <option value="INACTIVE">Inactive</option>
      </TextField>
      {hasFilters && <Button onClick={onClear}>Clear filters</Button>}
    </Box>
  );
}
```

`routes/employees.tsx`:

```tsx
import { Alert, Box, Button, LinearProgress, TablePagination, Typography } from "@mui/material";
import { Link, redirect, useLoaderData, useNavigation, useSearchParams } from "react-router";

import EmployeeFilters from "~/components/employees/EmployeeFilters";
import EmployeeTable from "~/components/employees/EmployeeTable";
import PageHeader from "~/components/layout/PageHeader";
import {
  DEFAULT_LIST_PARAMS,
  PAGE_SIZES,
  listDepartments,
  listEmployees,
  parseListParams,
  toSearchParams,
  type ListParams,
  type SortField,
} from "~/lib/employees-api";
import type { Route } from "./+types/employees";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const params = parseListParams(url.searchParams);

  const [employees, departments] = await Promise.all([
    listEmployees(request, params),
    listDepartments(request),
  ]);

  if (!employees.ok) throw new Response(employees.message, { status: employees.status });
  if (!departments.ok) throw new Response(departments.message, { status: departments.status });

  const { data, pagination } = employees.data;

  // A hand-edited or stale page number past the end: jump to the last page.
  if (data.length === 0 && pagination.total > 0 && params.page > 1) {
    const query = toSearchParams({ ...params, page: pagination.totalPages }).toString();
    throw redirect(`/employees${query ? `?${query}` : ""}`);
  }

  return { params, employees: data, pagination, departments: departments.data.departments };
}

export function ErrorBoundary() {
  return (
    <>
      <PageHeader title="Employees" />
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" component={Link} to="/employees">
            Try again
          </Button>
        }
      >
        Could not load employees. Please try again.
      </Alert>
    </>
  );
}

export default function Employees() {
  const { params, employees, pagination, departments } = useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();
  const navigation = useNavigation();

  const update = (patch: Partial<ListParams>, resetPage = true) => {
    setSearchParams(toSearchParams({ ...params, ...patch, ...(resetPage ? { page: 1 } : {}) }));
  };

  const handleSort = (field: SortField) => {
    update(
      field === params.sortBy
        ? { sortOrder: params.sortOrder === "asc" ? "desc" : "asc" }
        : { sortBy: field, sortOrder: "asc" },
    );
  };

  const hasFilters = Boolean(params.q || params.departmentId || params.country || params.status);
  const loading = navigation.state === "loading";

  return (
    <>
      <PageHeader
        title="Employees"
        action={
          <Button variant="contained" component={Link} to="/employees/new">
            Add employee
          </Button>
        }
      />

      <EmployeeFilters
        values={{ q: params.q, departmentId: params.departmentId, country: params.country, status: params.status }}
        departments={departments}
        onChange={(patch) => update(patch)}
        onClear={() => setSearchParams(toSearchParams({ ...DEFAULT_LIST_PARAMS, sortBy: params.sortBy, sortOrder: params.sortOrder, pageSize: params.pageSize }))}
      />

      {loading && <LinearProgress aria-label="Loading employees" sx={{ mb: 1 }} />}

      {employees.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography variant="h6" gutterBottom>
            {hasFilters ? "No employees match your filters" : "No employees yet"}
          </Typography>
          {hasFilters ? (
            <Button onClick={() => setSearchParams(new URLSearchParams())}>Clear filters</Button>
          ) : (
            <Button variant="contained" component={Link} to="/employees/new">
              Add employee
            </Button>
          )}
        </Box>
      ) : (
        <Box sx={{ opacity: loading ? 0.6 : 1 }}>
          <EmployeeTable
            employees={employees}
            sortBy={params.sortBy}
            sortOrder={params.sortOrder}
            onSort={handleSort}
          />
          <TablePagination
            component="div"
            count={pagination.total}
            page={pagination.page - 1}
            rowsPerPage={pagination.pageSize}
            rowsPerPageOptions={[...PAGE_SIZES]}
            onPageChange={(_event, page) => update({ page: page + 1 }, false)}
            onRowsPerPageChange={(event) => update({ pageSize: Number(event.target.value) })}
          />
        </Box>
      )}
    </>
  );
}
```

`routes.ts` — add inside the authenticated layout array: `route("employees", "routes/employees.tsx"),`.

`+types/employees` is generated by `react-router typegen` (part of `bun run typecheck`); run it before running the route test if types are stale.

Test caveat: the route test's `Route.LoaderArgs` cast follows the existing `login.action.test.ts` pattern.

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && bun run typecheck && bunx vitest run && bun run build`
Expected: PASS, build OK.

- [ ] **Step 5: Commit**

```bash
git add frontend/app
git commit -m "feat(frontend): add employee directory with search, filters, sorting and pagination"
```

---

### Task 7: Employee form, create and edit routes

**Files:**
- Create: `frontend/app/components/employees/EmployeeForm.tsx`, `frontend/app/routes/employee-new.tsx`, `frontend/app/routes/employee-edit.tsx`
- Modify: `frontend/app/routes.ts`, `frontend/app/routes.test.ts`
- Test: `EmployeeForm.test.tsx`, `routes/employee-new.test.tsx`, `routes/employee-edit.test.tsx`

**Interfaces:**
- Consumes: Task 5 exports.
- Produces: `<EmployeeForm mode departments defaultValues? submitting serverError? cancelHref onSubmit />` with `onSubmit(values: EmployeeFormValues)`.
- Route actions accept `application/json` bodies (RR `submit(values, { method: "post", encType: "application/json" })`). Create action returns `redirect("/employees/:id?notice=created")` or `{ error: FormError }`; edit action returns `redirect("/employees/:id?notice=updated")` or `{ error: FormError }`.
- Edit action strips `employeeCode` from the body before PATCH.

- [ ] **Step 1: Write failing tests**

`EmployeeForm.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import EmployeeForm from "./EmployeeForm";

const departments = [{ id: "d1", name: "Engineering" }];

function setup(props: Partial<React.ComponentProps<typeof EmployeeForm>> = {}) {
  const onSubmit = vi.fn();
  render(
    <EmployeeForm mode="create" departments={departments} submitting={false} cancelHref="/employees" onSubmit={onSubmit} {...props} />,
  );
  return onSubmit;
}

async function fillValid() {
  await userEvent.type(screen.getByLabelText("Employee ID"), "emp-9");
  await userEvent.type(screen.getByLabelText("First name"), "Asha");
  await userEvent.type(screen.getByLabelText("Last name"), "Rao");
  await userEvent.type(screen.getByLabelText("Email"), "asha@example.com");
  await userEvent.selectOptions(screen.getByLabelText("Department"), "d1");
  await userEvent.type(screen.getByLabelText("Designation"), "Engineer");
  await userEvent.selectOptions(screen.getByLabelText("Country"), "IN");
  await userEvent.type(screen.getByLabelText("Joining date"), "2024-01-15");
}

describe("EmployeeForm", () => {
  it("shows field-level errors and does not submit an empty form", async () => {
    const onSubmit = setup();

    await userEvent.click(screen.getByRole("button", { name: "Save employee" }));

    expect(await screen.findByText("Employee ID is required")).toBeInTheDocument();
    expect(screen.getByText("First name is required")).toBeInTheDocument();
    expect(screen.getByText("Select a department")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects an invalid email and a future date", async () => {
    setup();
    await userEvent.type(screen.getByLabelText("Email"), "nope");
    await userEvent.type(screen.getByLabelText("Joining date"), "2999-01-01");
    await userEvent.click(screen.getByRole("button", { name: "Save employee" }));

    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Joining date cannot be in the future")).toBeInTheDocument();
  });

  it("submits trimmed values when valid", async () => {
    const onSubmit = setup();
    await fillValid();
    await userEvent.click(screen.getByRole("button", { name: "Save employee" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      employeeCode: "emp-9",
      firstName: "Asha",
      email: "asha@example.com",
      departmentId: "d1",
      country: "IN",
      joiningDate: "2024-01-15",
      phone: "",
    });
  });

  it("disables the submit button while submitting", () => {
    setup({ submitting: true });
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("shows a server error on the matching field and as a summary", async () => {
    setup({ serverError: { message: "Email already in use", field: "email" } });
    expect((await screen.findAllByText("Email already in use")).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("locks the employee ID in edit mode and prefills values", () => {
    setup({
      mode: "edit",
      defaultValues: { employeeCode: "EMP-1", firstName: "Asha", lastName: "Rao", email: "a@b.com", phone: "", departmentId: "d1", designation: "Eng", country: "IN", joiningDate: "2024-01-15" },
    });
    expect(screen.getByLabelText("Employee ID")).toBeDisabled();
    expect(screen.getByLabelText("Employee ID")).toHaveValue("EMP-1");
    expect(screen.getByLabelText("First name")).toHaveValue("Asha");
  });

  it("links Cancel back to the given page", () => {
    setup();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/employees");
  });
});
```

Wrap renders in a `createMemoryRouter` if `Link` needs router context (it does — `Cancel` is a router `Link`). Use a small helper that renders the form as the route element of a memory router.

`routes/employee-new.test.tsx` — action tests in the style of `login.action.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { action } from "./employee-new";

const body = {
  employeeCode: "EMP-9", firstName: "Asha", lastName: "Rao", email: "asha@example.com", phone: "",
  departmentId: "d1", designation: "Engineer", country: "IN", joiningDate: "2024-01-15",
};
const call = () =>
  action({
    request: new Request("http://localhost:3000/employees/new", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: "session=abc" },
      body: JSON.stringify(body),
    }),
    params: {},
    context: {},
  } as Parameters<typeof action>[0]);
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("employee-new action", () => {
  it("creates and redirects to the profile with a notice", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ employee: { id: "e1" } }, 201));
    vi.stubGlobal("fetch", fetchMock);

    const result = (await call()) as Response;

    expect(result.status).toBe(302);
    expect(result.headers.get("Location")).toBe("/employees/e1?notice=created");
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it.each([
    ["DUPLICATE_EMPLOYEE_CODE", "employeeCode"],
    ["DUPLICATE_EMAIL", "email"],
  ])("maps %s to the %s field", async (code, field) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { message: "Conflict", code } }, 409)));
    expect(await call()).toEqual({ error: { message: "Conflict", field } });
  });

  it("returns a form-level error for other failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { message: "Validation failed", code: "VALIDATION_ERROR" } }, 400)));
    expect(await call()).toEqual({ error: { message: "Validation failed" } });
  });
});
```

Also write a component-level test for the new page in the same file (or `employee-new.component.test.tsx`): a memory router with `loader: () => ({ departments })` and `Component: EmployeeNew`; assert heading "Add employee", the form renders with department options, and an `actionData` error banner renders (via route `action: () => ({ error: { message: "Boom" } })` after a valid fill + submit; expect `await screen.findByText("Boom")`).

`routes/employee-edit.test.tsx`:
- action: strips `employeeCode` (body sent includes it; assert the PATCH body has no `employeeCode`), PATCHes `/api/employees/e1`, redirects to `/employees/e1?notice=updated`; 409 `DUPLICATE_EMAIL` → `{ error: { message, field: "email" } }`; 404 → form-level error.
- loader: 200 → `{ employee, departments }`; backend 404 → throws a `Response` with status 404.
- component: renders prefilled form with disabled Employee ID, heading "Edit employee", Cancel link to `/employees/e1`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && bunx vitest run app/components/employees/EmployeeForm.test.tsx app/routes/employee-new.test.tsx app/routes/employee-edit.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`EmployeeForm.tsx`:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Box, Button, Paper, TextField } from "@mui/material";
import { useEffect } from "react";
import { Controller, useForm, type FieldPath } from "react-hook-form";
import { Link } from "react-router";

import { COUNTRIES } from "~/lib/countries";
import { employeeFormSchema, localToday, type EmployeeFormValues } from "~/lib/employee-form";
import type { Department, FormError } from "~/lib/employees-api";

interface EmployeeFormProps {
  mode: "create" | "edit";
  departments: Department[];
  defaultValues?: Partial<EmployeeFormValues>;
  submitting: boolean;
  serverError?: FormError | null;
  cancelHref: string;
  onSubmit: (values: EmployeeFormValues) => void;
}

const EMPTY: EmployeeFormValues = {
  employeeCode: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  departmentId: "",
  designation: "",
  country: "",
  joiningDate: "",
};

export default function EmployeeForm({
  mode,
  departments,
  defaultValues,
  submitting,
  serverError,
  cancelHref,
  onSubmit,
}: EmployeeFormProps) {
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: { ...EMPTY, ...defaultValues },
  });

  useEffect(() => {
    if (serverError?.field) {
      setError(serverError.field, { type: "server", message: serverError.message });
    }
  }, [serverError, setError]);

  const text = (name: FieldPath<EmployeeFormValues>, label: string, extra: Record<string, unknown> = {}) => (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <TextField
          {...field}
          id={`employee-${name}`}
          label={label}
          fullWidth
          error={!!errors[name]}
          helperText={errors[name]?.message}
          {...extra}
        />
      )}
    />
  );

  const select = (
    name: "departmentId" | "country",
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <TextField
          {...field}
          id={`employee-${name}`}
          select
          label={label}
          fullWidth
          error={!!errors[name]}
          helperText={errors[name]?.message}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
        >
          <option value="" />
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </TextField>
      )}
    />
  );

  return (
    <Paper component="form" noValidate onSubmit={handleSubmit(onSubmit)} sx={{ p: 3, maxWidth: 720 }}>
      {serverError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {serverError.message}
        </Alert>
      )}

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
        {text("employeeCode", "Employee ID", { disabled: mode === "edit" })}
        <Box />
        {text("firstName", "First name")}
        {text("lastName", "Last name")}
        {text("email", "Email", { type: "email" })}
        {text("phone", "Phone")}
        {select(
          "departmentId",
          "Department",
          departments.map((department) => ({ value: department.id, label: department.name })),
        )}
        {text("designation", "Designation")}
        {select(
          "country",
          "Country",
          COUNTRIES.map((country) => ({ value: country.code, label: country.name })),
        )}
        {text("joiningDate", "Joining date", {
          type: "date",
          slotProps: { inputLabel: { shrink: true }, htmlInput: { max: localToday() } },
        })}
      </Box>

      <Box sx={{ display: "flex", gap: 2, mt: 3 }}>
        <Button type="submit" variant="contained" disabled={submitting}>
          {submitting ? "Saving…" : "Save employee"}
        </Button>
        <Button component={Link} to={cancelHref} disabled={submitting}>
          Cancel
        </Button>
      </Box>
    </Paper>
  );
}
```

Notes: `type="email"` with `noValidate` on the form keeps the browser from pre-empting zod messages. If `getByLabelText("Email")` is ambiguous, keep labels unique (they are). `<Link>` needs a router context — all renders go through a memory router.

`routes/employee-new.tsx`:

```tsx
import { Alert } from "@mui/material";
import { redirect, useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";

import EmployeeForm from "~/components/employees/EmployeeForm";
import PageHeader from "~/components/layout/PageHeader";
import type { EmployeeFormValues } from "~/lib/employee-form";
import { createEmployee, listDepartments, toFormError } from "~/lib/employees-api";
import type { Route } from "./+types/employee-new";

export async function loader({ request }: Route.LoaderArgs) {
  const departments = await listDepartments(request);
  if (!departments.ok) throw new Response(departments.message, { status: departments.status });
  return { departments: departments.data.departments };
}

export async function action({ request }: Route.ActionArgs) {
  const input = (await request.json()) as EmployeeFormValues;
  const result = await createEmployee(request, input);

  if (!result.ok) return { error: toFormError(result) };

  return redirect(`/employees/${result.data.employee.id}?notice=created`);
}

export default function EmployeeNew() {
  const { departments } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();

  return (
    <>
      <PageHeader title="Add employee" />
      <EmployeeForm
        mode="create"
        departments={departments}
        submitting={navigation.state !== "idle"}
        serverError={actionData?.error}
        cancelHref="/employees"
        onSubmit={(values) => submit(values, { method: "post", encType: "application/json" })}
      />
    </>
  );
}
```

Remove the unused `Alert` import if the linter-less typecheck does not flag it (it doesn't, but keep imports clean).

`routes/employee-edit.tsx`:

```tsx
import { redirect, useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";

import EmployeeForm from "~/components/employees/EmployeeForm";
import PageHeader from "~/components/layout/PageHeader";
import type { EmployeeFormValues } from "~/lib/employee-form";
import { getEmployee, listDepartments, toFormError, updateEmployee } from "~/lib/employees-api";
import type { Route } from "./+types/employee-edit";

export async function loader({ request, params }: Route.LoaderArgs) {
  const [employee, departments] = await Promise.all([
    getEmployee(request, params.id),
    listDepartments(request),
  ]);
  if (!employee.ok) throw new Response(employee.message, { status: employee.status });
  if (!departments.ok) throw new Response(departments.message, { status: departments.status });
  return { employee: employee.data.employee, departments: departments.data.departments };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { employeeCode: _employeeCode, ...input } = (await request.json()) as EmployeeFormValues;
  const result = await updateEmployee(request, params.id, input);

  if (!result.ok) return { error: toFormError(result) };

  return redirect(`/employees/${params.id}?notice=updated`);
}

export default function EmployeeEdit() {
  const { employee, departments } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();

  return (
    <>
      <PageHeader title="Edit employee" />
      <EmployeeForm
        mode="edit"
        departments={departments}
        defaultValues={{
          employeeCode: employee.employeeCode,
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email,
          phone: employee.phone ?? "",
          departmentId: employee.departmentId,
          designation: employee.designation,
          country: employee.country,
          joiningDate: employee.joiningDate,
        }}
        submitting={navigation.state !== "idle"}
        serverError={actionData?.error}
        cancelHref={`/employees/${employee.id}`}
        onSubmit={(values) => submit(values, { method: "post", encType: "application/json" })}
      />
    </>
  );
}
```

Both routes also export a route `ErrorBoundary` is NOT needed for edit's 404 here — it is handled in Task 8's shared approach: export from `employee-edit.tsx` the same small boundary used by the profile (see Task 8 `EmployeeNotFound`), or let the root boundary handle it. Use the root boundary for this task; Task 8 adds a friendlier component and can be reused here.

`routes.ts` — add `route("employees/new", "routes/employee-new.tsx"),` and `route("employees/:id/edit", "routes/employee-edit.tsx"),`. Update `routes.test.ts` expectation to include these two paths.

Disabled `employeeCode` is not in the submitted values? A disabled MUI input's value still lives in RHF state, so `values.employeeCode` is submitted; the edit action strips it. Keep the strip in the action (tested).

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && bun run typecheck && bunx vitest run && bun run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/app
git commit -m "feat(frontend): add employee create and edit forms"
```

---

### Task 8: Employee profile, status change and navigation polish

**Files:**
- Create: `frontend/app/routes/employee-profile.tsx`
- Modify: `frontend/app/routes.ts`, `frontend/app/routes.test.ts`, `frontend/app/routes/employee-edit.tsx` (reuse not-found boundary), `frontend/app/components/layout/AppLayout.tsx` (highlight active nav section)
- Test: `frontend/app/routes/employee-profile.test.tsx`, `frontend/app/components/layout/AppLayout.test.tsx` (extend)

**Interfaces:**
- Consumes: Task 5 exports.
- Produces: route `/employees/:id`. Action: form field `status` (`ACTIVE` | `INACTIVE`) → `setEmployeeStatus`; returns `{ message: string }` on success or `{ error: string }`.
- Produces: `export function ErrorBoundary()` in `employee-profile.tsx` showing "Employee not found" for 404 and a generic failure message otherwise, with a "Back to employees" link. `employee-edit.tsx` re-exports it: `export { ErrorBoundary } from "./employee-profile";`.

- [ ] **Step 1: Write failing tests** `routes/employee-profile.test.tsx`

Cases (memory router; route `/employees/:id` with `loader`, `action`, `Component: EmployeeProfile`, `ErrorBoundary`; mocked `fetch`):

1. **Renders details**: loader returns an employee; expect heading with the full name, Employee ID, email, `—` for a null phone, department, designation, country name ("India"), joining date, an "Active" chip, a "Back to employees" link with `href="/employees"`, an "Edit" link with `href="/employees/e1/edit"`, and the compensation placeholder text "Compensation details will be available with the Salary module."
2. **Created/updated notice**: initial entry `/employees/e1?notice=created` shows "Employee created" in a status/snackbar region; `?notice=updated` shows "Employee updated"; an unknown notice value shows nothing.
3. **Deactivate needs confirmation**: click "Deactivate" → dialog "Deactivate employee?" appears and no PATCH has been sent (`fetch` mock called only for the loader GET); click Cancel → dialog closes, still no PATCH; click Deactivate again then confirm → exactly one PATCH to `/api/employees/e1/status` with body `{"status":"INACTIVE"}`; after the stubbed PATCH resolves and the loader re-runs (stub returns an INACTIVE employee on the second GET), expect the "Inactive" chip, a "Reactivate" button and the message "Employee deactivated".
4. **Reactivate needs no dialog**: inactive employee → click "Reactivate" → PATCH `{"status":"ACTIVE"}` sent directly, message "Employee activated".
5. **Failure feedback**: PATCH returns 500 → an error alert/snackbar "Request failed" is shown and the page still shows the employee.
6. **Not found**: loader backend 404 → route ErrorBoundary shows "Employee not found" and "Back to employees" link; other failures show "Could not load this employee."
7. **Action unit tests** (like `login.action.test.ts`): `action` with `status=INACTIVE` form data calls the status endpoint with forwarded cookie and returns `{ message: "Employee deactivated" }`; invalid `status=FIRED` returns `{ error: "Invalid status" }` without calling fetch; backend failure returns `{ error: <message> }`.
8. Inactive employees remain fully visible: the Edit link is present for an inactive employee.

Extend `AppLayout.test.tsx`: with the router at `/employees/e1`, the "Employees" nav item has `aria-current="page"`/is `selected`, and "Dashboard" is not.

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && bunx vitest run app/routes/employee-profile.test.tsx app/components/layout`
Expected: FAIL.

- [ ] **Step 3: Implement**

`routes/employee-profile.tsx`:

```tsx
import { Alert, Box, Button, Card, CardContent, Link as MuiLink, Paper, Snackbar, Typography } from "@mui/material";
import { useEffect, useState, type ReactNode } from "react";
import { isRouteErrorResponse, Link, useFetcher, useLoaderData, useRouteError, useSearchParams } from "react-router";

import ConfirmDialog from "~/components/common/ConfirmDialog";
import StatusChip from "~/components/common/StatusChip";
import PageHeader from "~/components/layout/PageHeader";
import { countryName } from "~/lib/countries";
import { getEmployee, setEmployeeStatus } from "~/lib/employees-api";
import type { Route } from "./+types/employee-profile";

export async function loader({ request, params }: Route.LoaderArgs) {
  const result = await getEmployee(request, params.id);
  if (!result.ok) throw new Response(result.message, { status: result.status });
  return { employee: result.data.employee };
}

export async function action({ request, params }: Route.ActionArgs) {
  const formData = await request.formData();
  const status = formData.get("status");

  if (status !== "ACTIVE" && status !== "INACTIVE") return { error: "Invalid status" };

  const result = await setEmployeeStatus(request, params.id, status);
  if (!result.ok) return { error: result.message };

  return { message: status === "ACTIVE" ? "Employee activated" : "Employee deactivated" };
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <>
      <PageHeader title={notFound ? "Employee not found" : "Employee"} />
      <Alert severity={notFound ? "warning" : "error"} sx={{ mb: 2 }}>
        {notFound ? "This employee does not exist or was removed." : "Could not load this employee."}
      </Alert>
      <Button component={Link} to="/employees">
        Back to employees
      </Button>
    </>
  );
}

const NOTICES: Record<string, string> = { created: "Employee created", updated: "Employee updated" };

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography component="div">{children}</Typography>
    </Box>
  );
}

export default function EmployeeProfile() {
  const { employee } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<{ severity: "success" | "error"; text: string } | null>(null);

  const notice = NOTICES[searchParams.get("notice") ?? ""];
  useEffect(() => {
    if (notice) setToast({ severity: "success", text: notice });
  }, [notice]);

  useEffect(() => {
    const data = fetcher.data;
    if (!data) return;
    if ("error" in data && data.error) setToast({ severity: "error", text: data.error });
    else if ("message" in data && data.message) setToast({ severity: "success", text: data.message });
  }, [fetcher.data]);

  const changeStatus = (status: "ACTIVE" | "INACTIVE") => {
    setConfirmOpen(false);
    fetcher.submit({ status }, { method: "post" });
  };

  const closeToast = () => {
    setToast(null);
    if (searchParams.has("notice")) setSearchParams({}, { replace: true });
  };

  const saving = fetcher.state !== "idle";
  const fullName = `${employee.firstName} ${employee.lastName}`;

  return (
    <>
      <Box sx={{ mb: 1 }}>
        <MuiLink component={Link} to="/employees">
          ← Back to employees
        </MuiLink>
      </Box>

      <PageHeader
        title={fullName}
        action={
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button component={Link} to={`/employees/${employee.id}/edit`} variant="outlined">
              Edit
            </Button>
            {employee.status === "ACTIVE" ? (
              <Button color="error" variant="outlined" disabled={saving} onClick={() => setConfirmOpen(true)}>
                Deactivate
              </Button>
            ) : (
              <Button variant="contained" disabled={saving} onClick={() => changeStatus("ACTIVE")}>
                Reactivate
              </Button>
            )}
          </Box>
        }
      />

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" } }}>
          <Detail label="Employee ID">{employee.employeeCode}</Detail>
          <Detail label="Status">
            <StatusChip status={employee.status} />
          </Detail>
          <Detail label="Email">{employee.email}</Detail>
          <Detail label="Phone">{employee.phone ?? "—"}</Detail>
          <Detail label="Department">{employee.department.name}</Detail>
          <Detail label="Designation">{employee.designation}</Detail>
          <Detail label="Country">{countryName(employee.country)}</Detail>
          <Detail label="Joining date">{employee.joiningDate}</Detail>
        </Box>
      </Paper>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>
            Compensation
          </Typography>
          <Typography color="text.secondary">
            Compensation details will be available with the Salary module.
          </Typography>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title="Deactivate employee?"
        message={`${fullName} will be marked inactive. Their record and history are kept, and you can reactivate them at any time.`}
        confirmLabel="Deactivate"
        loading={saving}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => changeStatus("INACTIVE")}
      />

      <Snackbar open={toast !== null} autoHideDuration={5000} onClose={closeToast}>
        {toast ? (
          <Alert severity={toast.severity} onClose={closeToast} role="status">
            {toast.text}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}
```

`routes.ts` — add `route("employees/:id", "routes/employee-profile.tsx"),` after `employees/new` (static segments win over `:id` in React Router, so order is for readability only). Update `routes.test.ts` to the full four-path expectation.

`employee-edit.tsx` — add `export { ErrorBoundary } from "./employee-profile";`.

`AppLayout.tsx` — highlight the current section: import `useLocation` from `react-router`, and in the nav map use

```tsx
<ListItemButton key={item.to} component={Link} to={item.to} selected={pathname === item.to || pathname.startsWith(`${item.to}/`)}>
```
with `const { pathname } = useLocation();` at the top of the component. MUI sets `aria-current` only via the `selected` class, not an attribute; in the test assert `toHaveClass("Mui-selected")` on the "Employees" link and not on "Dashboard".

- [ ] **Step 4: Run to verify everything passes**

Run: `cd frontend && bun run typecheck && bunx vitest run && bun run build`
Also `cd backend && bun run typecheck && bun run test`.
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/app
git commit -m "feat(frontend): add employee profile with status change confirmation"
```

---

### Task 9: End-to-end verification and documentation

**Files:**
- Modify: `docs/04-implementation-status.md`, `README.md`, `backend/README.md`, `frontend/README.md`, `docs/02-tech-stack-and-architecture.md` (only if something diverges), `docs/implementation/2026-10-02-foundation-summary.md` (three stale lines)
- Create: `docs/implementation/2026-10-02-employee-management-summary.md`

- [ ] **Step 1: Full automated run**

```bash
cd backend && bun run typecheck && bun run test
cd ../frontend && bun run typecheck && bun run test && bun run build
```

Record the passing test counts for the docs. Everything must be green before continuing.

- [ ] **Step 2: Manual API pass with curl** (dev servers: `cd backend && bun run db:deploy && bun run db:seed && bun run dev` in one terminal; Postgres via `docker compose up -d postgres`)

```bash
curl -s -c /tmp/jar -H 'Content-Type: application/json' -d '{"email":"admin@salary-management.local","password":"ChangeMe123!"}' localhost:3001/api/auth/login
curl -s -b /tmp/jar 'localhost:3001/api/employees?pageSize=2&sortBy=name'
curl -s -b /tmp/jar 'localhost:3001/api/employees?q=asha&status=ACTIVE'
curl -s -b /tmp/jar localhost:3001/api/departments
DEPT=$(curl -s -b /tmp/jar localhost:3001/api/departments | python3 -c 'import sys,json;print(json.load(sys.stdin)["departments"][0]["id"])')
curl -s -b /tmp/jar -H 'Content-Type: application/json' -d "{\"employeeCode\":\"cur-1\",\"firstName\":\"Cu\",\"lastName\":\"Rl\",\"email\":\"cu@example.com\",\"departmentId\":\"$DEPT\",\"designation\":\"QA\",\"country\":\"IN\",\"joiningDate\":\"2024-01-15\"}" localhost:3001/api/employees
# repeat the POST: expect 409 DUPLICATE_EMPLOYEE_CODE; unauthenticated GET: expect 401
```

Clean up the `CUR-1` employee afterwards (`docker compose exec postgres psql ... delete from "Employee" where "employeeCode"='CUR-1'`).

- [ ] **Step 3: Manual UI pass** (second terminal `cd frontend && bun run dev`; open `http://localhost:3000`). There is no browser automation in this repo: if a real browser is not available to the agent, drive the SSR flow with curl as the foundation did (login, then GET `/employees`, `/employees/new`, `/employees/<id>`, `/employees/<id>/edit`, POST the status form) and say clearly in the summary that a click-through in a real browser was not performed. Check: list renders seeded rows, search/filter/sort/pagination change the URL and results, create redirects to the profile with the notice, duplicate code shows the field error, deactivate asks for confirmation and the chip flips, an unknown id shows "Employee not found", unauthenticated access redirects to `/login`.

- [ ] **Step 4: Docs**

- `docs/04-implementation-status.md`: set the Employee module row to ✅ Done (note: CRUD, directory, profile, status; profile compensation/audit sections pending Salary/Audit), bump "Last updated".
- `docs/implementation/2026-10-02-employee-management-summary.md`: original task (paraphrase of the request), what was completed, data model (copy the Prisma models), API endpoints table with query params, validation rules, decisions (the nine from the spec plus URL-state list, JSON `encType` submits, notice query param), tests and checks run with counts, limitations (below), and "Next session": Salary module (`Salary` records linked to `Employee.id`, revision history, audit) plus carried-over foundation minors.
- Known limitations to record: no audit trail of employee changes; `ILIKE` search without trigram index (measure at 10k rows); static country list duplicated in backend and frontend (keep in sync); server-side validation errors return no per-field details so only 409/`INVALID_DEPARTMENT` map to fields; joining-date "not in the future" is evaluated in UTC on the server and local time in the browser; inactive users' list behaviour is "All" by default; no browser click-through if not performed.
- READMEs: add the new endpoints/routes and `db:seed` sample data to the root/backend/frontend READMEs where the foundation endpoints are listed.
- `docs/02-tech-stack-and-architecture.md`: only add a short note if something differs from the documented structure (it should not).
- `docs/implementation/2026-10-02-foundation-summary.md`: fix the three stale lines — the sentence claiming a dev-secret default for `JWT_SECRET` in compose (it is required now), the test counts (32 backend / 19 frontend at foundation end), and the "weak cookie assertions" limitation (fixed in the final review round).

- [ ] **Step 5: Commit**

```bash
git add docs README.md backend/README.md frontend/README.md
git commit -m "docs: document employee management module and update status"
```

- [ ] **Step 6: Final whole-branch review and hand-off**

Dispatch one fresh reviewer over `git diff main...HEAD` against the spec and this plan; fix Critical/Important findings, re-run all checks, then push `feature/employee-management` (`git push -u origin feature/employee-management`). The user opens and merges the PR. Do not merge or commit to `main`.
