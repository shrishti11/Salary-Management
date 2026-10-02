import { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import { STATS_COLUMNS, populationCtes, employeeConditions, type PopulationFilters } from "./analytics.sql.ts";

export interface CurrencyStats {
  currency: string;
  count: number;
  total: string;
  average: string;
  median: string;
  min: string;
  max: string;
  p25: string;
  p75: string;
}

export interface SummaryFilters extends PopulationFilters {
  currency?: string | undefined;
}

export async function getSummary(f: SummaryFilters) {
  const [stats, counts, byStatus] = await Promise.all([
    prisma.$queryRaw<CurrencyStats[]>(Prisma.sql`
      WITH ${populationCtes(f)}
      SELECT currency, ${STATS_COLUMNS} FROM pop GROUP BY currency ORDER BY 2 DESC, currency`),
    prisma.$queryRaw<{ total: number; salaried: number }[]>(Prisma.sql`
      WITH ${populationCtes(f)}
      SELECT (SELECT COUNT(*) FROM emp)::int AS total, (SELECT COUNT(*) FROM cur)::int AS salaried`),
    prisma.$queryRaw<{ status: string; n: number }[]>(Prisma.sql`
      SELECT e.status::text AS status, COUNT(*)::int AS n FROM "Employee" e
      WHERE ${employeeConditions(f, true)} GROUP BY e.status`),
  ]);

  const active = byStatus.find((r) => r.status === "ACTIVE")?.n ?? 0;
  const inactive = byStatus.find((r) => r.status === "INACTIVE")?.n ?? 0;
  const { total, salaried } = counts[0] ?? { total: 0, salaried: 0 };

  return {
    asOf: f.asOf,
    basis: f.basis,
    headcount: { total: active + inactive, active, inactive, withSalary: salaried, withoutSalary: total - salaried },
    currencies: stats.filter((s) => !f.currency || s.currency === f.currency),
  };
}

export const MIN_GROUP_SIZE = 3;
const BUCKETS = 10;

export interface DistributionBucket {
  from: string;
  to: string;
  count: number;
}

const centsToString = (cents: number) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;

export async function getDistribution(f: SummaryFilters) {
  const rows = await prisma.$queryRaw<{ currency: string; lo: string; hi: string; bucket: number; n: number }[]>(Prisma.sql`
    WITH ${populationCtes(f)},
    pc AS (SELECT currency, ROUND(v * 100)::bigint AS c FROM pop ${f.currency ? Prisma.sql`WHERE currency = ${f.currency}` : Prisma.empty}),
    bounds AS (SELECT currency, MIN(c) AS lo, MAX(c) AS hi FROM pc GROUP BY currency)
    SELECT currency, lo::text AS lo, hi::text AS hi, bucket, COUNT(*)::int AS n
    FROM (
      SELECT p.currency, b.lo, b.hi,
        CASE WHEN b.hi = b.lo THEN 0
             ELSE LEAST(LEAST(${BUCKETS}, b.hi - b.lo + 1) - 1, ((p.c - b.lo) * LEAST(${BUCKETS}, b.hi - b.lo + 1)) / (b.hi - b.lo))
        END::int AS bucket
      FROM pc p JOIN bounds b ON b.currency = p.currency
    ) x
    GROUP BY currency, lo, hi, bucket
    ORDER BY currency, bucket`);

  const byCurrency = new Map<string, { lo: number; hi: number; counts: Map<number, number> }>();
  for (const row of rows) {
    const entry = byCurrency.get(row.currency) ?? { lo: Number(row.lo), hi: Number(row.hi), counts: new Map() };
    entry.counts.set(row.bucket, row.n);
    byCurrency.set(row.currency, entry);
  }

  const currencies = [...byCurrency.entries()].map(([currency, { lo, hi, counts }]) => {
    const span = hi - lo;
    const k = span === 0 ? 1 : Math.min(BUCKETS, span + 1);
    const edge = (i: number) => lo + Math.ceil((i * span) / k);
    const buckets: DistributionBucket[] = [];
    let count = 0;
    for (let i = 0; i < k; i += 1) {
      const n = counts.get(i) ?? 0;
      count += n;
      buckets.push({
        from: centsToString(edge(i)),
        to: centsToString(i === k - 1 ? hi : edge(i + 1) - 1),
        count: n,
      });
    }
    return { currency, count, buckets };
  });
  currencies.sort((a, b) => b.count - a.count || a.currency.localeCompare(b.currency));

  return { asOf: f.asOf, basis: f.basis, currencies };
}

export interface SuppressedStats {
  currency: string;
  count: number;
  suppressed: true;
}
export type GroupCurrency = CurrencyStats | SuppressedStats;
export interface GroupRow {
  key: string;
  label: string;
  headcount: number;
  withoutSalary: number;
  currencies: GroupCurrency[];
}

export interface GroupFilters extends SummaryFilters {
  groupBy: "department" | "country" | "designation";
  suppress?: boolean | undefined;
}

export async function getGroups(f: GroupFilters): Promise<{ asOf: string; basis: string; groupBy: string; groups: GroupRow[] }> {
  const empKey = {
    department: Prisma.sql`emp."departmentId"`,
    country: Prisma.sql`emp.country`,
    designation: Prisma.sql`emp.designation`,
  }[f.groupBy];
  const popKey = {
    department: Prisma.sql`"departmentId"`,
    country: Prisma.sql`country`,
    designation: Prisma.sql`designation`,
  }[f.groupBy];

  const [heads, stats] = await Promise.all([
    prisma.$queryRaw<{ key: string; headcount: number }[]>(Prisma.sql`
      WITH ${populationCtes(f)}
      SELECT ${empKey}::text AS key, COUNT(*)::int AS headcount FROM emp GROUP BY 1`),
    prisma.$queryRaw<(CurrencyStats & { key: string })[]>(Prisma.sql`
      WITH ${populationCtes(f)}
      SELECT ${popKey}::text AS key, currency, ${STATS_COLUMNS} FROM pop GROUP BY 1, currency ORDER BY 1, 3 DESC, currency`),
  ]);

  const labels = new Map<string, string>();
  if (f.groupBy === "department") {
    const depts = await prisma.department.findMany({ select: { id: true, name: true } });
    for (const d of depts) labels.set(d.id, d.name);
  }

  const salariedByKey = new Map<string, number>();
  const currenciesByKey = new Map<string, GroupCurrency[]>();
  for (const { key, ...stat } of stats) {
    salariedByKey.set(key, (salariedByKey.get(key) ?? 0) + stat.count);
    if (f.currency && stat.currency !== f.currency) continue;
    const entry: GroupCurrency = f.suppress !== false && stat.count < MIN_GROUP_SIZE ? { currency: stat.currency, count: stat.count, suppressed: true } : stat;
    currenciesByKey.set(key, [...(currenciesByKey.get(key) ?? []), entry]);
  }

  const groups: GroupRow[] = heads.map(({ key, headcount }) => ({
    key,
    label: labels.get(key) ?? key,
    headcount,
    withoutSalary: headcount - (salariedByKey.get(key) ?? 0),
    currencies: [...(currenciesByKey.get(key) ?? [])].sort((a, b) => b.count - a.count || a.currency.localeCompare(b.currency)),
  }));
  groups.sort((a, b) => b.headcount - a.headcount || a.label.localeCompare(b.label));

  return { asOf: f.asOf, basis: f.basis, groupBy: f.groupBy, groups };
}

export async function getFilterOptions() {
  const [departments, countries, designations, currencies] = await Promise.all([
    prisma.department.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ distinct: ["country"], select: { country: true }, orderBy: { country: "asc" } }),
    prisma.employee.findMany({ distinct: ["designation"], select: { designation: true }, orderBy: { designation: "asc" } }),
    prisma.salaryRecord.findMany({ distinct: ["currency"], select: { currency: true }, orderBy: { currency: "asc" } }),
  ]);
  return {
    departments,
    countries: countries.map((c) => c.country),
    designations: designations.map((d) => d.designation),
    currencies: currencies.map((c) => c.currency),
  };
}
