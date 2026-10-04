import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/prisma";
import { createTestUser } from "../../test/helpers";
import { getDemoDataStatus, seedDemoData } from "./demo-data.service";

const SUFFIX = randomUUID().slice(0, 8);
const USER_EMAIL = `demo-svc-${SUFFIX}@example.com`;
const options = { target: 60, emailDomain: `demo-${SUFFIX}.example` };
let userId: string;

beforeAll(async () => {
  userId = (await createTestUser(USER_EMAIL, "ADMIN")).id;
});

afterAll(async () => {
  const where = { email: { endsWith: `@${options.emailDomain}` } };
  await prisma.salaryRecord.deleteMany({ where: { employee: where } }); // components cascade
  await prisma.employee.deleteMany({ where });
  await prisma.user.delete({ where: { email: USER_EMAIL } });
  await prisma.$disconnect();
});

describe("seedDemoData", () => {
  it("reports not seeded before the first run", async () => {
    expect(await getDemoDataStatus(options)).toEqual({ seeded: false, count: 0, target: 60 });
  });

  it("seeds exactly the target with salary history, and a second run is a no-op", async () => {
    const first = await seedDemoData(userId, options);
    expect(first).toMatchObject({ created: true, count: 60, target: 60 });
    expect(await getDemoDataStatus(options)).toEqual({ seeded: true, count: 60, target: 60 });

    const where = { employee: { email: { endsWith: `@${options.emailDomain}` } } };
    const recordCount = await prisma.salaryRecord.count({ where });
    expect(recordCount).toBeGreaterThan(40);
    expect(await prisma.salaryComponent.count({ where: { salaryRecord: where } })).toBeGreaterThanOrEqual(recordCount);

    const second = await seedDemoData(userId, options);
    expect(second).toMatchObject({ created: false, count: 60 });
    expect(await prisma.employee.count({ where: where.employee })).toBe(60);
  });

  it("assigns sequential EMP-NNNNN codes from the shared sequence", async () => {
    const rows = await prisma.employee.findMany({ where: { email: { endsWith: `@${options.emailDomain}` } }, select: { employeeCode: true } });
    expect(rows.every((r) => /^EMP-\d{5,}$/.test(r.employeeCode))).toBe(true);
    expect(new Set(rows.map((r) => r.employeeCode)).size).toBe(60);
  });

  it("serialises concurrent requests so a double click seeds once", async () => {
    const domain = { target: 20, emailDomain: `race-${SUFFIX}.example` };
    try {
      const results = await Promise.all([seedDemoData(userId, domain), seedDemoData(userId, domain), seedDemoData(userId, domain)]);
      expect(results.filter((r) => r.created)).toHaveLength(1);
      expect(await prisma.employee.count({ where: { email: { endsWith: `@${domain.emailDomain}` } } })).toBe(20);
    } finally {
      const where = { email: { endsWith: `@${domain.emailDomain}` } };
      await prisma.salaryRecord.deleteMany({ where: { employee: where } });
      await prisma.employee.deleteMany({ where });
    }
  });

  it("tops up a partial set instead of duplicating", async () => {
    const domain = { target: 30, emailDomain: `top-${SUFFIX}.example` };
    try {
      await seedDemoData(userId, { ...domain, target: 10 });
      const result = await seedDemoData(userId, domain);
      expect(result).toMatchObject({ created: true, count: 30 });
      expect(await prisma.employee.count({ where: { email: { endsWith: `@${domain.emailDomain}` } } })).toBe(30);
    } finally {
      const where = { email: { endsWith: `@${domain.emailDomain}` } };
      await prisma.salaryRecord.deleteMany({ where: { employee: where } });
      await prisma.employee.deleteMany({ where });
    }
  });

  it("reseeds: replaces only the demo rows with a fresh set, leaving other employees alone", async () => {
    const domain = { target: 15, emailDomain: `reset-${SUFFIX}.example` };
    const dept = await prisma.department.create({ data: { name: `Reset Dept ${SUFFIX}` } });
    const keeper = await prisma.employee.create({
      data: {
        employeeCode: `KEEP-${SUFFIX}`, firstName: "Keep", lastName: "Me", email: `keep-${SUFFIX}@example.com`, departmentId: dept.id,
        designation: "Engineer", country: "IN", joiningDate: new Date("2024-01-15T00:00:00.000Z"),
      },
    });
    const where = { email: { endsWith: `@${domain.emailDomain}` } };
    try {
      await seedDemoData(userId, domain);
      const before = new Set((await prisma.employee.findMany({ where, select: { id: true } })).map((e) => e.id));

      const result = await seedDemoData(userId, { ...domain, reset: true });
      expect(result).toMatchObject({ created: true, count: 15 });
      const after = await prisma.employee.findMany({ where, select: { id: true } });
      expect(after).toHaveLength(15);
      expect(after.some((e) => before.has(e.id))).toBe(false);
      expect(await prisma.employee.findUnique({ where: { id: keeper.id } })).not.toBeNull();
      expect(await prisma.salaryRecord.count({ where: { employee: where } })).toBeGreaterThanOrEqual(15);
    } finally {
      await prisma.salaryRecord.deleteMany({ where: { employee: where } });
      await prisma.employee.deleteMany({ where });
      await prisma.employee.delete({ where: { id: keeper.id } });
      await prisma.department.delete({ where: { id: dept.id } });
    }
  });
});
