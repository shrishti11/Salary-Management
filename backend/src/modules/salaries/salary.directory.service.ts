import type { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import { contains } from "../employees/employee.service.ts";
import { computeTotals } from "./salary.calc.ts";
import type { ListDirectoryQuery } from "./salary.schema.ts";

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const todayUtc = () => new Date().toISOString().slice(0, 10);
const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

const rowInclude = {
  department: { select: { id: true, name: true } },
  salaryRecords: {
    orderBy: { effectiveDate: "desc" },
    include: { components: { select: { type: true, amount: true } } },
  },
} satisfies Prisma.EmployeeInclude;

type DirectoryEmployee = Prisma.EmployeeGetPayload<{ include: typeof rowInclude }>;

function serializeRow(employee: DirectoryEmployee, today: string) {
  const records = employee.salaryRecords; // newest first
  const currentRow = records.find((r) => isoDate(r.effectiveDate) <= today);
  const totals =
    currentRow && computeTotals(currentRow.components.map((c) => ({ type: c.type, amount: c.amount.toFixed(2) })));
  return {
    employee: {
      id: employee.id,
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      designation: employee.designation,
      joiningDate: isoDate(employee.joiningDate),
      department: employee.department,
      country: employee.country,
      status: employee.status,
    },
    current:
      currentRow && totals
        ? {
            id: currentRow.id,
            currency: currentRow.currency,
            effectiveDate: isoDate(currentRow.effectiveDate),
            gross: totals.gross,
            net: totals.net,
            deductions: totals.deductions,
            reason: currentRow.reason,
          }
        : null,
    hasScheduled: records.some((r) => isoDate(r.effectiveDate) > today),
  };
}

export type SalaryDirectoryRow = ReturnType<typeof serializeRow>;

function buildOrderBy(
  sortBy: Exclude<ListDirectoryQuery["sortBy"], "effectiveDate">,
  order: "asc" | "desc",
): Prisma.EmployeeOrderByWithRelationInput[] {
  switch (sortBy) {
    case "name":
      return [{ lastName: order }, { firstName: order }, { id: "asc" }];
    case "department":
      return [{ department: { name: order } }, { id: "asc" }];
    case "employeeCode":
      return [{ employeeCode: order }, { id: "asc" }];
    case "country":
      return [{ country: order }, { id: "asc" }];
    case "joiningDate":
      return [{ joiningDate: order }, { id: "asc" }];
  }
}

export async function listSalaryDirectory(query: ListDirectoryQuery) {
  const { page, pageSize, q, departmentId, country, status, salary, sortBy, sortOrder } = query;
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
  const today = todayUtc();
  const todayDate = toDate(today);

  const where: Prisma.EmployeeWhereInput = {
    ...(departmentId && { departmentId }),
    ...(country && { country }),
    ...(status !== "ALL" && { status }),
    ...(salary === "with" && { salaryRecords: { some: { effectiveDate: { lte: todayDate } } } }),
    ...(salary === "without" && { salaryRecords: { none: { effectiveDate: { lte: todayDate } } } }),
    ...(tokens.length > 0 && {
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

  const skip = (page - 1) * pageSize;
  let total: number;
  let rows: DirectoryEmployee[];

  if (sortBy === "effectiveDate") {
    // "Current effective date" is not a column, so Prisma cannot order by it. Order the matching ids in memory
    // (nulls last in both directions, id tie-breaker), then load only the requested page. Fine at HR scale.
    const candidates = await prisma.employee.findMany({
      where,
      select: {
        id: true,
        salaryRecords: { where: { effectiveDate: { lte: todayDate } }, orderBy: { effectiveDate: "desc" }, take: 1, select: { effectiveDate: true } },
      },
    });
    total = candidates.length;
    const keyed = candidates.map((c) => ({ id: c.id, date: c.salaryRecords[0] ? isoDate(c.salaryRecords[0].effectiveDate) : null }));
    const dir = sortOrder === "asc" ? 1 : -1;
    keyed.sort((a, b) => {
      if (a.date === null || b.date === null) {
        if (a.date === b.date) return a.id < b.id ? -1 : 1;
        return a.date === null ? 1 : -1;
      }
      if (a.date !== b.date) return a.date < b.date ? -dir : dir;
      return a.id < b.id ? -1 : 1;
    });
    const pageIds = keyed.slice(skip, skip + pageSize).map((k) => k.id);
    const loaded = await prisma.employee.findMany({ where: { id: { in: pageIds } }, include: rowInclude });
    const byId = new Map(loaded.map((e) => [e.id, e]));
    rows = pageIds.flatMap((id) => byId.get(id) ?? []);
  } else {
    const [count, found] = await prisma.$transaction([
      prisma.employee.count({ where }),
      prisma.employee.findMany({ where, orderBy: buildOrderBy(sortBy, sortOrder), skip, take: pageSize, include: rowInclude }),
    ]);
    total = count;
    rows = found;
  }

  return {
    data: rows.map((row) => serializeRow(row, today)),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}
