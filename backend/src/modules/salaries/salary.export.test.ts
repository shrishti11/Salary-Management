import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../app";
import { prisma } from "../../lib/prisma";
import { createTestUser, loginAs } from "../../test/helpers";

const SUFFIX = randomUUID().slice(0, 8);
const USER_EMAIL = `sal-exp-${SUFFIX}@example.com`;
const P = `X${SUFFIX.toUpperCase()}`;

let deptId: string;
let agent: Awaited<ReturnType<typeof loginAs>>;

beforeAll(async () => {
  const user = await createTestUser(USER_EMAIL);
  deptId = (await prisma.department.create({ data: { name: `Export Dept ${SUFFIX}` } })).id;
  const mk = (n: string, firstName: string, lastName: string, status: "ACTIVE" | "INACTIVE" = "ACTIVE") =>
    prisma.employee.create({
      data: {
        employeeCode: `${P}-${n}`, firstName, lastName, email: `${P}-${n}@example.com`.toLowerCase(), departmentId: deptId,
        designation: "Engineer", country: "IN", joiningDate: new Date("2024-01-15T00:00:00.000Z"), status,
      },
    });
  const asha = await mk("1", "Asha", "Rao, Jr");
  await mk("2", "=cmd", "Evil");
  await mk("3", "Gone", "Away", "INACTIVE");
  await prisma.salaryRecord.create({
    data: {
      employeeId: asha.id, currency: "INR", effectiveDate: new Date("2024-01-15T00:00:00.000Z"), reason: "Initial", createdById: user.id,
      components: { create: [{ type: "BASE", name: "Base salary", amount: "1000.00" }, { type: "DEDUCTION", name: "PF", amount: "100.00" }] },
    },
  });
  agent = await loginAs(USER_EMAIL);
});

afterAll(async () => {
  await prisma.salaryRecord.deleteMany({ where: { employee: { departmentId: deptId } } });
  await prisma.employee.deleteMany({ where: { departmentId: deptId } });
  await prisma.department.delete({ where: { id: deptId } });
  await prisma.user.delete({ where: { email: USER_EMAIL } });
  await prisma.$disconnect();
});

describe("GET /api/salaries/export", () => {
  it("requires a session", async () => {
    expect((await request(app).get("/api/salaries/export")).status).toBe(401);
  });

  it("returns the filtered list as a CSV download with escaping and no pagination", async () => {
    const response = await agent.get("/api/salaries/export").query({ q: P, pageSize: 1 });
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^text\/csv/);
    expect(response.headers["content-disposition"]).toMatch(/^attachment; filename="employees-\d{4}-\d{2}-\d{2}\.csv"$/);

    const lines = response.text.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe(
      "Employee ID,First name,Last name,Email,Department,Designation,Country,Joining date,Status,Currency,Gross,Deductions,Net,Salary effective date,Revision scheduled",
    );
    expect(lines).toHaveLength(3); // header + 2 active employees; the inactive one is filtered by default
    const asha = lines.find((l) => l.includes(`${P}-1`))!;
    const email = `${P}-1@example.com`.toLowerCase();
    expect(asha).toBe(
      `${P}-1,Asha,"Rao, Jr",${email},Export Dept ${SUFFIX},Engineer,IN,2024-01-15,ACTIVE,INR,1000.00,100.00,900.00,2024-01-15,No`,
    );
    expect(lines.find((l) => l.includes(`${P}-2`))).toContain("'=cmd");
  });

  it("honours the status filter and rejects unknown query keys", async () => {
    const all = await agent.get("/api/salaries/export").query({ q: P, status: "ALL" });
    expect(all.text.trim().split("\r\n")).toHaveLength(4);
    expect((await agent.get("/api/salaries/export").query({ nope: "1" })).status).toBe(400);
  });
});
