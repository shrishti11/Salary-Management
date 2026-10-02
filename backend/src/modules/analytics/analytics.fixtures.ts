import { randomUUID } from "node:crypto";

import { prisma } from "../../lib/prisma.ts";
import { createTestUser, loginAs } from "../../test/helpers.ts";

type Component = { type: "BASE" | "ALLOWANCE" | "BONUS" | "DEDUCTION"; name: string; amount: string };
const base = (amount: string): Component[] => [{ type: "BASE", name: "Base salary", amount }];
const date = (s: string) => new Date(`${s}T00:00:00.000Z`);
export const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

/**
 * Employees (all share `designation`):
 *  e1 deptA US ACTIVE   USD 2024-01-01 base 1000 | 2025-01-01 base 1200 + allowance 100 - deduction 200 (gross 1300, net 1100) | future base 5000 (ignored)
 *  e2 deptA US ACTIVE   USD 2024-06-01 base 2000 + bonus 500 (gross 2500)
 *  e3 deptA US ACTIVE   USD 2024-06-01 base 3000
 *  e4 deptB IN ACTIVE   INR 2023-01-01 base 100000 | 2025-03-01 base 120000
 *  e5 deptB DE ACTIVE   EUR 2024-01-01 base 4000 | 2025-02-01 USD base 4400 (currency change)
 *  e6 deptB DE INACTIVE USD 2024-01-01 base 9000
 *  e7 deptB IN ACTIVE   no salary
 *  e8 deptB US ACTIVE   only a future-dated salary (day +10, USD 3000)
 */
export async function createAnalyticsFixture() {
  const suffix = randomUUID().slice(0, 8);
  const designation = `QA-${suffix}`;
  const user = await createTestUser(`ana-${suffix}@example.com`);
  const deptA = await prisma.department.create({ data: { name: `Ana A ${suffix}` } });
  const deptB = await prisma.department.create({ data: { name: `Ana B ${suffix}` } });
  const ids: Record<string, string> = {};

  const specs = [
    { n: "1", dept: deptA.id, country: "US", status: "ACTIVE" as const },
    { n: "2", dept: deptA.id, country: "US", status: "ACTIVE" as const },
    { n: "3", dept: deptA.id, country: "US", status: "ACTIVE" as const },
    { n: "4", dept: deptB.id, country: "IN", status: "ACTIVE" as const },
    { n: "5", dept: deptB.id, country: "DE", status: "ACTIVE" as const },
    { n: "6", dept: deptB.id, country: "DE", status: "INACTIVE" as const },
    { n: "7", dept: deptB.id, country: "IN", status: "ACTIVE" as const },
    { n: "8", dept: deptB.id, country: "US", status: "ACTIVE" as const },
  ];
  for (const s of specs) {
    const e = await prisma.employee.create({
      data: {
        employeeCode: `AN${suffix.toUpperCase()}-${s.n}`,
        firstName: `First${s.n}`,
        lastName: `Last${s.n}`,
        email: `an${s.n}.${suffix}@example.com`,
        departmentId: s.dept,
        designation,
        country: s.country,
        joiningDate: date("2015-01-01"),
        status: s.status,
      },
    });
    ids[s.n] = e.id;
  }

  async function add(n: string, effectiveDate: string, components: Component[], currency = "USD") {
    await prisma.salaryRecord.create({
      data: { employeeId: ids[n]!, currency, effectiveDate: date(effectiveDate), reason: `r-${effectiveDate}`, createdById: user.id, components: { create: components } },
    });
  }
  await add("1", "2024-01-01", base("1000.00"));
  await add("1", "2025-01-01", [
    { type: "BASE", name: "Base salary", amount: "1200.00" },
    { type: "ALLOWANCE", name: "Housing", amount: "100.00" },
    { type: "DEDUCTION", name: "Tax", amount: "200.00" },
  ]);
  await add("1", day(30), base("5000.00"));
  await add("2", "2024-06-01", [
    { type: "BASE", name: "Base salary", amount: "2000.00" },
    { type: "BONUS", name: "Spot", amount: "500.00" },
  ]);
  await add("3", "2024-06-01", base("3000.00"));
  await add("4", "2023-01-01", base("100000.00"), "INR");
  await add("4", "2025-03-01", base("120000.00"), "INR");
  await add("5", "2024-01-01", base("4000.00"), "EUR");
  await add("5", "2025-02-01", base("4400.00"), "USD");
  await add("6", "2024-01-01", base("9000.00"));
  await add("8", day(10), base("3000.00"));

  const agent = await loginAs(`ana-${suffix}@example.com`);

  async function cleanup() {
    const all = Object.values(ids);
    await prisma.salaryRecord.deleteMany({ where: { employeeId: { in: all } } });
    await prisma.employee.deleteMany({ where: { id: { in: all } } });
    await prisma.department.deleteMany({ where: { id: { in: [deptA.id, deptB.id] } } });
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
  }
  return { suffix, designation, deptA: deptA.id, deptB: deptB.id, userId: user.id, agent, ids, cleanup };
}
