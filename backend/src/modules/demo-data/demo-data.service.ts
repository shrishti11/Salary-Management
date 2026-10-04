import { prisma } from "../../lib/prisma.ts";
import { DEMO_DEPARTMENTS, DEMO_EMAIL_DOMAIN, DEMO_TARGET, generateDemoData } from "./demo-data.generator.ts";

// Arbitrary constant: serialises concurrent seed requests so a double click can never seed twice.
const SEED_LOCK_ID = 727_001;
const EMPLOYEE_CHUNK = 2000;
const RECORD_CHUNK = 4000;
const COMPONENT_CHUNK = 5000;

const demoWhere = (emailDomain: string) => ({ email: { endsWith: `@${emailDomain}` } });

// Tests pass their own target and domain so they never touch (or depend on) real demo data.
export interface DemoDataOptions {
  target?: number;
  emailDomain?: string;
  now?: Date;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

export async function getDemoDataStatus({ target = DEMO_TARGET, emailDomain = DEMO_EMAIL_DOMAIN }: DemoDataOptions = {}) {
  const count = await prisma.employee.count({ where: demoWhere(emailDomain) });
  return { seeded: count >= target, count, target };
}

/**
 * Tops the database up to exactly `target` (default 10,000) demo employees (with departments, salary history and components).
 * Idempotent: once the target is reached it does nothing, so repeated clicks never create more.
 */
export async function seedDemoData(
  createdById: string,
  { target = DEMO_TARGET, emailDomain = DEMO_EMAIL_DOMAIN, now = new Date() }: DemoDataOptions = {},
) {
  const started = Date.now();
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SEED_LOCK_ID})`;

      const existing = await tx.employee.count({ where: demoWhere(emailDomain) });
      if (existing >= target) return { created: false, count: existing, target, durationMs: Date.now() - started };

      const missing = target - existing;
      await tx.department.createMany({ data: Object.keys(DEMO_DEPARTMENTS).map((name) => ({ name })), skipDuplicates: true });
      const departments = new Map((await tx.department.findMany({ select: { id: true, name: true } })).map((d) => [d.name, d.id]));

      const codes = (
        await tx.$queryRaw<{ code: string }[]>`
          SELECT 'EMP-' || lpad(nextval('employee_code_seq')::text, 5, '0') AS code
          FROM generate_series(1, ${missing}::int)`
      ).map((row) => row.code);

      const { employees, records, components } = generateDemoData(codes, now, existing + 1, emailDomain);

      for (const batch of chunks(employees, EMPLOYEE_CHUNK)) {
        await tx.employee.createMany({
          data: batch.map(({ departmentName, ...employee }) => ({ ...employee, departmentId: departments.get(departmentName)! })),
        });
      }
      for (const batch of chunks(records, RECORD_CHUNK)) {
        await tx.salaryRecord.createMany({ data: batch.map((record) => ({ ...record, createdById })) });
      }
      for (const batch of chunks(components, COMPONENT_CHUNK)) {
        await tx.salaryComponent.createMany({ data: batch });
      }

      return { created: true, count: target, target, durationMs: Date.now() - started };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}
