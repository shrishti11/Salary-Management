import { prisma } from "../../lib/prisma.ts";
import { computeChange, computeTotals } from "../salaries/salary.calc.ts";
import { todayUtc } from "./analytics.dates.ts";
import { getGroups, getSummary, type GroupFilters, type GroupRow } from "./analytics.service.ts";

const RECENT = 5;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export async function getRecentRevisions(limit = RECENT) {
  const ids = await prisma.$queryRaw<{ id: string }[]>`
    SELECT sr.id FROM "SalaryRecord" sr
    WHERE EXISTS (
      SELECT 1 FROM "SalaryRecord" p
      WHERE p."employeeId" = sr."employeeId" AND p."effectiveDate" < sr."effectiveDate"
    )
    ORDER BY sr."createdAt" DESC, sr.id
    LIMIT ${limit}`;
  if (ids.length === 0) return [];

  const records = await prisma.salaryRecord.findMany({
    where: { id: { in: ids.map((r) => r.id) } },
    include: {
      components: { select: { type: true, amount: true } },
      employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  const order = new Map(ids.map((r, i) => [r.id, i]));
  records.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const price = (components: { type: "BASE" | "ALLOWANCE" | "BONUS" | "DEDUCTION"; amount: { toFixed(n: number): string } }[]) =>
    computeTotals(components.map((c) => ({ type: c.type, amount: c.amount.toFixed(2) })));

  return Promise.all(
    records.map(async (r) => {
      const previous = await prisma.salaryRecord.findFirst({
        where: { employeeId: r.employeeId, effectiveDate: { lt: r.effectiveDate } },
        orderBy: { effectiveDate: "desc" },
        include: { components: { select: { type: true, amount: true } } },
      });
      const totals = price(r.components);
      const change = previous
        ? computeChange(
            { currency: previous.currency, totals: price(previous.components) },
            { currency: r.currency, totals },
          )
        : null;
      return {
        id: r.id,
        employee: { id: r.employee.id, employeeCode: r.employee.employeeCode, name: `${r.employee.firstName} ${r.employee.lastName}` },
        currency: r.currency,
        effectiveDate: isoDate(r.effectiveDate),
        gross: totals.gross,
        changePercent: change ? change.grossPercent : null,
        reason: r.reason,
        createdBy: r.createdBy,
        createdAt: r.createdAt.toISOString(),
      };
    }),
  );
}

export async function getDashboard() {
  const asOf = todayUtc();
  const filters = { status: "ACTIVE", basis: "gross", asOf } as const;
  const groupFilters = (groupBy: GroupFilters["groupBy"]): GroupFilters => ({ ...filters, groupBy, suppress: false });

  const [summary, deptGroups, countryGroups, departments, totalEmployees, recentEmployees, recentRevisions] = await Promise.all([
    getSummary(filters),
    getGroups(groupFilters("department")),
    getGroups(groupFilters("country")),
    prisma.department.findMany({ select: { id: true, name: true } }),
    prisma.employee.count(),
    prisma.employee.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: RECENT,
      select: { id: true, employeeCode: true, firstName: true, lastName: true, joiningDate: true, createdAt: true, department: { select: { name: true } } },
    }),
    getRecentRevisions(RECENT),
  ]);

  // The dashboard shows department/country money even for small groups: `suppress: false` (suppression is for the comparison view).
  const mapMoney = (group: GroupRow) =>
    group.currencies.flatMap((c) => ("suppressed" in c ? [] : [{ currency: c.currency, count: c.count, total: c.total, average: c.average }]));

  const deptByKey = new Map(deptGroups.groups.map((g) => [g.key, g]));
  const departmentRows = departments
    .map((d) => {
      const g = deptByKey.get(d.id);
      return { id: d.id, name: d.name, headcount: g?.headcount ?? 0, currencies: g ? mapMoney(g) : [] };
    })
    .sort((a, b) => b.headcount - a.headcount || a.name.localeCompare(b.name));

  return {
    asOf,
    metrics: {
      totalEmployees,
      activeEmployees: summary.headcount.active,
      departmentCount: departments.length,
      countryCount: countryGroups.groups.length,
      withoutSalary: summary.headcount.withoutSalary,
      currencies: summary.currencies,
    },
    departments: departmentRows,
    countries: countryGroups.groups.map((g) => ({ country: g.key, headcount: g.headcount, currencies: mapMoney(g) })),
    recentEmployees: recentEmployees.map((e) => ({
      id: e.id,
      employeeCode: e.employeeCode,
      name: `${e.firstName} ${e.lastName}`,
      department: e.department.name,
      joiningDate: isoDate(e.joiningDate),
      createdAt: e.createdAt.toISOString(),
    })),
    recentRevisions,
  };
}
