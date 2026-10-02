import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../app";
import { prisma } from "../../lib/prisma";
import { createTestUser, forgedCookie, loginAs } from "../../test/helpers";

const SUFFIX = randomUUID().slice(0, 8);
const USER_EMAIL = `sal-routes-${SUFFIX}@example.com`;
const ADMIN_EMAIL = `sal-admin-${SUFFIX}@example.com`;

let departmentId: string;
let agent: Awaited<ReturnType<typeof loginAs>>;
const employeeIds: string[] = [];

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const body = (o: Record<string, unknown> = {}) => ({
  currency: "USD",
  effectiveDate: "2024-01-01",
  components: [{ type: "BASE", name: "Base salary", amount: "1000.00" }],
  ...o,
});
const post = (id: string, b: unknown) => agent.post(`/api/employees/${id}/salaries`).send(b as object);

async function makeEmployee(overrides: Record<string, unknown> = {}) {
  const n = randomUUID().slice(0, 8);
  const employee = await prisma.employee.create({
    data: {
      employeeCode: `S-${n.toUpperCase()}`,
      firstName: "Asha",
      lastName: "Rao",
      email: `sal-${n}@example.com`,
      departmentId,
      designation: "Engineer",
      country: "IN",
      joiningDate: new Date("2020-01-01T00:00:00.000Z"),
      ...overrides,
    },
  });
  employeeIds.push(employee.id);
  return employee;
}

beforeAll(async () => {
  await createTestUser(USER_EMAIL);
  departmentId = (await prisma.department.create({ data: { name: `Sal Dept ${SUFFIX}` } })).id;
  agent = await loginAs(USER_EMAIL);
});

afterAll(async () => {
  await prisma.salaryRecord.deleteMany({ where: { employeeId: { in: employeeIds } } });
  await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
  await prisma.department.deleteMany({ where: { id: departmentId } });
  await prisma.user.deleteMany({ where: { email: { in: [USER_EMAIL, ADMIN_EMAIL] } } });
  await prisma.$disconnect();
});

describe("authentication and authorization", () => {
  it("returns 401 without a cookie", async () => {
    const id = randomUUID();
    expect((await request(app).get(`/api/employees/${id}/salaries`)).status).toBe(401);
    expect((await request(app).post(`/api/employees/${id}/salaries`).send(body())).status).toBe(401);
  });

  it("returns 403 for a non-HR role", async () => {
    const id = randomUUID();
    const cookie = forgedCookie("VIEWER");
    expect((await request(app).get(`/api/employees/${id}/salaries`).set("Cookie", cookie)).status).toBe(403);
    expect((await request(app).post(`/api/employees/${id}/salaries`).set("Cookie", cookie).send(body())).status).toBe(403);
  });

  it("allows an ADMIN to post and read", async () => {
    await createTestUser(ADMIN_EMAIL, "ADMIN");
    const admin = await loginAs(ADMIN_EMAIL);
    const emp = await makeEmployee();
    expect((await admin.post(`/api/employees/${emp.id}/salaries`).send(body())).status).toBe(201);
    expect((await admin.get(`/api/employees/${emp.id}/salaries`)).status).toBe(200);
  });
});

describe("reading", () => {
  it("returns an empty view for an employee with no records", async () => {
    const emp = await makeEmployee();
    const res = await agent.get(`/api/employees/${emp.id}/salaries`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ current: null, scheduled: null, history: [] });
  });

  it("returns 404 EMPLOYEE_NOT_FOUND for unknown employee and 400 for malformed id", async () => {
    const id = randomUUID();
    const get = await agent.get(`/api/employees/${id}/salaries`);
    expect(get.status).toBe(404);
    expect(get.body.error.code).toBe("EMPLOYEE_NOT_FOUND");
    const created = await post(id, body());
    expect(created.status).toBe(404);
    expect(created.body.error.code).toBe("EMPLOYEE_NOT_FOUND");
    expect((await agent.get("/api/employees/not-a-uuid/salaries")).status).toBe(400);
    expect((await post("not-a-uuid", body())).status).toBe(400);
  });

  it("GET /:salaryId returns own record, 404 for other employee's or unknown", async () => {
    const a = await makeEmployee();
    const b = await makeEmployee();
    const created = await post(a.id, body());
    const salaryId = created.body.salary.id as string;

    const ok = await agent.get(`/api/employees/${a.id}/salaries/${salaryId}`);
    expect(ok.status).toBe(200);
    expect(ok.body.salary.id).toBe(salaryId);

    const other = await agent.get(`/api/employees/${b.id}/salaries/${salaryId}`);
    expect(other.status).toBe(404);
    expect(other.body.error.code).toBe("SALARY_NOT_FOUND");

    const random = await agent.get(`/api/employees/${a.id}/salaries/${randomUUID()}`);
    expect(random.status).toBe(404);
    expect(random.body.error.code).toBe("SALARY_NOT_FOUND");
  });

  it("returns 404 for PATCH and DELETE on a salary record", async () => {
    const emp = await makeEmployee();
    const salaryId = (await post(emp.id, body())).body.salary.id as string;
    const url = `/api/employees/${emp.id}/salaries/${salaryId}`;
    expect((await agent.patch(url).send({})).status).toBe(404);
    expect((await agent.delete(url)).status).toBe(404);
  });
});

describe("creating salary records", () => {
  it("creates the initial record with totals", async () => {
    const emp = await makeEmployee();
    const res = await post(
      emp.id,
      body({
        components: [
          { type: "BASE", name: "Base salary", amount: "1000.00" },
          { type: "ALLOWANCE", name: "Housing", amount: "200.00" },
          { type: "DEDUCTION", name: "Tax", amount: "100.00" },
        ],
      }),
    );
    expect(res.status).toBe(201);
    const s = res.body.salary;
    expect(s.reason).toBe("Initial salary");
    expect(s.createdBy.name).toBe("Test User");
    expect(s.totals).toEqual({ gross: "1200.00", deductions: "100.00", net: "1100.00" });
    expect(s.changeFromPrevious).toBeNull();
    expect(s.status).toBe("CURRENT");
    expect(s.effectiveDate).toBe("2024-01-01");
  });

  it("revises without mutating the previous record", async () => {
    const emp = await makeEmployee();
    const first = (await post(emp.id, body())).body.salary;
    const res = await post(
      emp.id,
      body({
        effectiveDate: "2025-01-01",
        reason: "Annual review",
        components: [{ type: "BASE", name: "Base salary", amount: "1200.00" }],
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.salary.changeFromPrevious.gross).toBe("200.00");
    expect(res.body.salary.changeFromPrevious.grossPercent).toBe("20.00");

    const list = (await agent.get(`/api/employees/${emp.id}/salaries`)).body;
    expect(list.history).toHaveLength(2);
    expect(list.history[0].id).toBe(res.body.salary.id);
    expect(list.current.id).toBe(res.body.salary.id);
    const old = list.history[1];
    expect(old.id).toBe(first.id);
    expect(old.status).toBe("PREVIOUS");
    expect(old.reason).toBe("Initial salary");
    expect(old.components).toEqual(first.components);
  });

  it("requires a reason for a revision", async () => {
    const emp = await makeEmployee();
    await post(emp.id, body());
    const res = await post(emp.id, body({ effectiveDate: "2025-01-01" }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("REASON_REQUIRED");
  });

  it("rejects same or earlier effective dates", async () => {
    const emp = await makeEmployee();
    await post(emp.id, body());
    const same = await post(emp.id, body({ reason: "Reason" }));
    expect(same.status).toBe(409);
    expect(same.body.error.code).toBe("DUPLICATE_EFFECTIVE_DATE");
    const earlier = await post(emp.id, body({ effectiveDate: "2023-06-01", reason: "Reason" }));
    expect(earlier.status).toBe(409);
    expect(earlier.body.error.code).toBe("EFFECTIVE_DATE_NOT_AFTER_LATEST");
    expect((await agent.get(`/api/employees/${emp.id}/salaries`)).body.history).toHaveLength(1);
  });

  it("rejects a date before the joining date", async () => {
    const emp = await makeEmployee();
    const res = await post(emp.id, body({ effectiveDate: "2019-12-31" }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("EFFECTIVE_DATE_BEFORE_JOINING");
  });

  it("rejects deductions exceeding earnings", async () => {
    const emp = await makeEmployee();
    const res = await post(
      emp.id,
      body({
        components: [
          { type: "BASE", name: "Base salary", amount: "100.00" },
          { type: "DEDUCTION", name: "Tax", amount: "150.00" },
        ],
      }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("NEGATIVE_NET");
  });

  it("rejects schema violations with VALIDATION_ERROR", async () => {
    const emp = await makeEmployee();
    const cases = [
      body({
        components: [
          { type: "BASE", name: "Base A", amount: "1.00" },
          { type: "BASE", name: "Base B", amount: "1.00" },
        ],
      }),
      body({ components: [{ type: "BASE", name: "Base salary", amount: "1e3" }] }),
      body({ currency: "XXX" }),
      body({ extra: true }),
    ];
    for (const c of cases) {
      const res = await post(emp.id, c);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("treats a future-dated record as scheduled", async () => {
    const emp = await makeEmployee();
    const first = (await post(emp.id, body())).body.salary;
    const future = await post(emp.id, body({ effectiveDate: day(30), reason: "Promotion" }));
    expect(future.status).toBe(201);
    expect(future.body.salary.status).toBe("SCHEDULED");
    const list = (await agent.get(`/api/employees/${emp.id}/salaries`)).body;
    expect(list.scheduled.id).toBe(future.body.salary.id);
    expect(list.current.id).toBe(first.id);
  });

  it("has no current when only a future record exists", async () => {
    const emp = await makeEmployee();
    const future = await post(emp.id, body({ effectiveDate: day(30) }));
    expect(future.status).toBe(201);
    const list = (await agent.get(`/api/employees/${emp.id}/salaries`)).body;
    expect(list.current).toBeNull();
    expect(list.scheduled.id).toBe(future.body.salary.id);
  });

  it("omits change when the currency changes", async () => {
    const emp = await makeEmployee();
    await post(emp.id, body());
    const res = await post(emp.id, body({ effectiveDate: "2025-01-01", currency: "EUR", reason: "Relocation" }));
    expect(res.status).toBe(201);
    expect(res.body.salary.changeFromPrevious).toBeNull();
  });

  it("blocks changes for inactive employees but still allows reading", async () => {
    const emp = await makeEmployee();
    await post(emp.id, body());
    await prisma.employee.update({ where: { id: emp.id }, data: { status: "INACTIVE" } });
    const res = await post(emp.id, body({ effectiveDate: "2025-01-01", reason: "Reason" }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMPLOYEE_INACTIVE");
    const get = await agent.get(`/api/employees/${emp.id}/salaries`);
    expect(get.status).toBe(200);
    expect(get.body.history).toHaveLength(1);
  });
});

describe("concurrency", () => {
  it("allows exactly one of two simultaneous identical revisions", async () => {
    const emp = await makeEmployee();
    const same = body({ reason: "Concurrent" });
    const results = await Promise.all([post(emp.id, same), post(emp.id, same)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await agent.get(`/api/employees/${emp.id}/salaries`)).body.history).toHaveLength(1);
  });

  it("waits on the employee row lock (FOR UPDATE) until it is released", async () => {
    const emp = await makeEmployee();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => (locked = resolve));

    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${emp.id} FOR UPDATE`;
      locked();
      await held;
    });
    await lockTaken;

    let settled = false;
    const pending = post(emp.id, body()).then((r) => {
      settled = true;
      return r;
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(settled).toBe(false);

    release();
    await holder;
    const res = await pending;
    expect(res.status).toBe(201);
  });
});
