import { Prisma } from "../../../generated/prisma/client.ts";

export interface PopulationFilters {
  departmentId?: string | undefined;
  country?: string | undefined;
  designation?: string | undefined;
  status: "ACTIVE" | "INACTIVE" | "ALL";
  basis: "gross" | "net";
  asOf: string;
}

export function employeeConditions(f: PopulationFilters, ignoreStatus = false): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (f.departmentId) parts.push(Prisma.sql`e."departmentId" = ${f.departmentId}`);
  if (f.country) parts.push(Prisma.sql`e.country = ${f.country}`);
  if (f.designation) parts.push(Prisma.sql`e.designation = ${f.designation}`);
  if (!ignoreStatus && f.status !== "ALL") parts.push(Prisma.sql`e.status = ${f.status}::"EmployeeStatus"`);
  return Prisma.join(parts, " AND ");
}

/**
 * CTE list (no leading WITH):
 *  emp: filtered employees; rec: salary totals per record up to asOf;
 *  cur: each employee's latest record as of asOf with the basis value `v`;
 *  pop: salaried employees with group keys. Not currency-filtered: callers filter currency.
 */
export function populationCtes(f: PopulationFilters, ignoreStatus = false): Prisma.Sql {
  const value = f.basis === "net" ? Prisma.sql`(r.gross - r.deductions)` : Prisma.sql`r.gross`;
  return Prisma.sql`
    emp AS (
      SELECT e.id, e."departmentId", e.country, e.designation, e.status
      FROM "Employee" e
      WHERE ${employeeConditions(f, ignoreStatus)}
    ),
    rec AS (
      SELECT sr.id, sr."employeeId", sr.currency, sr."effectiveDate",
        COALESCE(SUM(sc.amount) FILTER (WHERE sc.type <> 'DEDUCTION'), 0) AS gross,
        COALESCE(SUM(sc.amount) FILTER (WHERE sc.type = 'DEDUCTION'), 0) AS deductions
      FROM "SalaryRecord" sr
      JOIN emp ON emp.id = sr."employeeId"
      LEFT JOIN "SalaryComponent" sc ON sc."salaryRecordId" = sr.id
      WHERE sr."effectiveDate" <= ${f.asOf}::date
      GROUP BY sr.id
    ),
    cur AS (
      SELECT DISTINCT ON (r."employeeId") r."employeeId", r.currency, ${value} AS v
      FROM rec r
      ORDER BY r."employeeId", r."effectiveDate" DESC
    ),
    pop AS (
      SELECT emp.id, emp."departmentId", emp.country, emp.designation, cur.currency, cur.v
      FROM emp JOIN cur ON cur."employeeId" = emp.id
    )`;
}

/** Columns in order: count, total, average, median, min, max, p25, p75. Use with `FROM pop ... GROUP BY`. */
export const STATS_COLUMNS = Prisma.sql`
  COUNT(*)::int AS count,
  ROUND(SUM(v), 2)::text AS total,
  ROUND(AVG(v), 2)::text AS average,
  ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY v))::numeric, 2)::text AS median,
  ROUND(MIN(v), 2)::text AS min,
  ROUND(MAX(v), 2)::text AS max,
  ROUND((percentile_cont(0.25) WITHIN GROUP (ORDER BY v))::numeric, 2)::text AS p25,
  ROUND((percentile_cont(0.75) WITHIN GROUP (ORDER BY v))::numeric, 2)::text AS p75`;
