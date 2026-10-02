import type { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import { AppError } from "../../middleware/error.middleware.ts";
import { computeChange, computeTotals } from "./salary.calc.ts";
import type { CreateSalaryInput } from "./salary.schema.ts";

const recordInclude = {
  components: true,
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.SalaryRecordInclude;

type RecordRow = Prisma.SalaryRecordGetPayload<{ include: typeof recordInclude }>;

const TYPE_ORDER = { BASE: 0, ALLOWANCE: 1, BONUS: 2, DEDUCTION: 3 } as const;
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const todayUtc = () => new Date().toISOString().slice(0, 10);
const employeeNotFound = () => new AppError(404, "Employee not found", "EMPLOYEE_NOT_FOUND");

function prismaCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function serialize(row: RecordRow, previous: RecordRow | undefined, today: string, currentId: string | null) {
  const components = [...row.components]
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.name.localeCompare(b.name))
    .map((c) => ({ id: c.id, type: c.type, name: c.name, amount: c.amount.toFixed(2) }));
  const totals = computeTotals(components);
  const view = { currency: row.currency, totals };
  const prevView = previous && {
    currency: previous.currency,
    totals: computeTotals(previous.components.map((c) => ({ type: c.type, amount: c.amount.toFixed(2) }))),
  };
  const date = isoDate(row.effectiveDate);
  return {
    id: row.id,
    employeeId: row.employeeId,
    currency: row.currency,
    effectiveDate: date,
    reason: row.reason,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    components,
    totals: { gross: totals.gross, deductions: totals.deductions, net: totals.net },
    changeFromPrevious: prevView ? computeChange(prevView, view) : null,
    status: date > today ? ("SCHEDULED" as const) : row.id === currentId ? ("CURRENT" as const) : ("PREVIOUS" as const),
  };
}

export type SalaryDto = ReturnType<typeof serialize>;

export async function getSalaries(employeeId: string) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!employee) throw employeeNotFound();

  const rows = await prisma.salaryRecord.findMany({
    where: { employeeId },
    orderBy: { effectiveDate: "asc" },
    include: recordInclude,
  });
  const today = todayUtc();
  const currentRow = [...rows].reverse().find((r) => isoDate(r.effectiveDate) <= today);
  const dtos = rows.map((row, i) => serialize(row, rows[i - 1], today, currentRow?.id ?? null));
  const history = [...dtos].reverse();
  const scheduled = history.filter((d) => d.status === "SCHEDULED").at(-1) ?? null;
  return { current: history.find((d) => d.status === "CURRENT") ?? null, scheduled, history };
}

export async function getSalary(employeeId: string, salaryId: string) {
  const { history } = await getSalaries(employeeId);
  const salary = history.find((d) => d.id === salaryId);
  if (!salary) throw new AppError(404, "Salary record not found", "SALARY_NOT_FOUND");
  return salary;
}

export async function createSalary(employeeId: string, userId: string, input: CreateSalaryInput) {
  const id = await prisma
    .$transaction(async (tx) => {
      // Serialise concurrent revisions for this employee.
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Employee" WHERE "id" = ${employeeId} FOR UPDATE`;
      if (locked.length === 0) throw employeeNotFound();

      const employee = await tx.employee.findUniqueOrThrow({ where: { id: employeeId } });
      if (employee.status !== "ACTIVE") {
        throw new AppError(409, "Inactive employees cannot receive salary changes", "EMPLOYEE_INACTIVE");
      }

      const latest = await tx.salaryRecord.findFirst({
        where: { employeeId },
        orderBy: { effectiveDate: "desc" },
        select: { effectiveDate: true },
      });

      if (latest && !input.reason) throw new AppError(400, "A reason is required for a salary revision", "REASON_REQUIRED");
      if (input.effectiveDate < isoDate(employee.joiningDate)) {
        throw new AppError(400, "Effective date cannot be before the joining date", "EFFECTIVE_DATE_BEFORE_JOINING");
      }
      if (latest) {
        const latestDate = isoDate(latest.effectiveDate);
        if (input.effectiveDate === latestDate) {
          throw new AppError(409, "A salary record already exists for this date", "DUPLICATE_EFFECTIVE_DATE");
        }
        if (input.effectiveDate < latestDate) {
          throw new AppError(409, "Effective date must be after the latest salary record", "EFFECTIVE_DATE_NOT_AFTER_LATEST");
        }
      }
      if (computeTotals(input.components).netCents < 0) {
        throw new AppError(400, "Deductions cannot exceed total earnings", "NEGATIVE_NET");
      }

      // Phase 4 (Audit): record the salary change here, inside the same transaction.
      const record = await tx.salaryRecord.create({
        data: {
          employeeId,
          currency: input.currency,
          effectiveDate: new Date(`${input.effectiveDate}T00:00:00.000Z`),
          reason: input.reason ?? "Initial salary",
          createdById: userId,
          components: { create: input.components },
        },
      });
      return record.id;
    })
    .catch((error: unknown) => {
      if (prismaCode(error) === "P2002") {
        throw new AppError(409, "A salary record already exists for this date", "DUPLICATE_EFFECTIVE_DATE");
      }
      throw error;
    });

  return getSalary(employeeId, id);
}
