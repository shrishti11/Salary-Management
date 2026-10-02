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
