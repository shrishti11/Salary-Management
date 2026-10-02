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

describe("DELETE /api/employees/:id", () => {
  it("is not supported: 404 and the employee remains", async () => {
    const created = await create();
    expect((await agent.delete(`/api/employees/${created.id}`)).status).toBe(404);
    expect((await agent.get(`/api/employees/${created.id}`)).status).toBe(200);
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
