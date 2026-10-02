import { COUNTRIES } from "~/lib/countries";
import { CURRENCIES } from "~/lib/currencies";
import { apiCall, type ApiResult } from "~/lib/employees-api";

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
export interface SuppressedStats {
  currency: string;
  count: number;
  suppressed: true;
}
export type Result<T> = ApiResult<T>;

export type StatusFilter = "ACTIVE" | "INACTIVE" | "ALL";
export type Basis = "gross" | "net";
export type GroupBy = "department" | "country" | "designation";

export interface AnalyticsParams {
  departmentId: string;
  country: string;
  designation: string;
  status: StatusFilter;
  currency: string;
  basis: Basis;
  asOf: string;
  from: string;
  to: string;
  groupBy: GroupBy;
}

export const DEFAULT_ANALYTICS_PARAMS: AnalyticsParams = {
  departmentId: "",
  country: "",
  designation: "",
  status: "ACTIVE",
  currency: "",
  basis: "gross",
  asOf: "",
  from: "",
  to: "",
  groupBy: "department",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const realDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value ? value : "";

export function parseAnalyticsParams(sp: URLSearchParams): AnalyticsParams {
  const get = (key: string) => sp.get(key) ?? "";
  const status = get("status");
  const basis = get("basis");
  const groupBy = get("groupBy");
  return {
    departmentId: UUID.test(get("departmentId")) ? get("departmentId") : "",
    country: COUNTRIES.some((c) => c.code === get("country")) ? get("country") : "",
    designation: get("designation").trim().slice(0, 100),
    status: status === "ACTIVE" || status === "INACTIVE" || status === "ALL" ? status : "ACTIVE",
    currency: CURRENCIES.some((c) => c.code === get("currency")) ? get("currency") : "",
    basis: basis === "net" ? "net" : "gross",
    asOf: realDate(get("asOf")),
    from: realDate(get("from")),
    to: realDate(get("to")),
    groupBy: groupBy === "country" || groupBy === "designation" ? groupBy : "department",
  };
}

export function toAnalyticsSearchParams(params: Partial<AnalyticsParams>): URLSearchParams {
  const merged = { ...DEFAULT_ANALYTICS_PARAMS, ...params };
  const search = new URLSearchParams();
  for (const key of Object.keys(DEFAULT_ANALYTICS_PARAMS) as (keyof AnalyticsParams)[]) {
    const value = merged[key];
    if (value === "" || value === DEFAULT_ANALYTICS_PARAMS[key]) continue;
    search.set(key, value);
  }
  return search;
}

/** Filters that narrow the data; `basis` and `groupBy` are view options and do not count. */
export function hasActiveAnalyticsFilters(params: AnalyticsParams): boolean {
  const { basis: _basis, groupBy: _groupBy, ...filters } = params;
  const { basis: _b, groupBy: _g, ...defaults } = DEFAULT_ANALYTICS_PARAMS;
  return (Object.keys(filters) as (keyof typeof filters)[]).some((key) => filters[key] !== defaults[key]);
}

const COMMON = ["departmentId", "country", "designation", "status", "currency", "basis"] as const;
type Key = keyof AnalyticsParams;

function fetchAnalytics<T>(request: Request, path: string, params: AnalyticsParams, extra: readonly Key[]) {
  const search = new URLSearchParams();
  for (const key of [...COMMON, ...extra] as Key[]) {
    const value = params[key];
    if (value !== "" && value !== DEFAULT_ANALYTICS_PARAMS[key]) search.set(key, value);
  }
  const query = search.toString();
  return apiCall<T>(request, `${path}${query ? `?${query}` : ""}`);
}

export interface SummaryData {
  asOf: string;
  basis: Basis;
  headcount: { total: number; active: number; inactive: number; withSalary: number; withoutSalary: number };
  currencies: CurrencyStats[];
}
export interface DistributionData {
  asOf: string;
  basis: Basis;
  currencies: { currency: string; count: number; buckets: { from: string; to: string; count: number }[] }[];
}
export interface GroupRow {
  key: string;
  label: string;
  headcount: number;
  withoutSalary: number;
  currencies: (CurrencyStats | SuppressedStats)[];
}
export interface GroupsData {
  asOf: string;
  basis: Basis;
  groupBy: GroupBy;
  groups: GroupRow[];
}
export interface TrendMonth {
  month: string;
  revisionCount: number;
  newSalaryCount: number;
  avgChangePercent: string | null;
  avgGross: string | null;
  avgNet: string | null;
}
export interface TrendsData {
  from: string;
  to: string;
  basis: Basis;
  currencies: { currency: string; months: TrendMonth[] }[];
}
export interface FilterOptions {
  departments: { id: string; name: string }[];
  countries: string[];
  designations: string[];
  currencies: string[];
}
export interface MoneyLine {
  currency: string;
  count: number;
  total: string;
  average: string;
}
export interface DashboardData {
  asOf: string;
  metrics: {
    totalEmployees: number;
    activeEmployees: number;
    departmentCount: number;
    countryCount: number;
    withoutSalary: number;
    currencies: CurrencyStats[];
  };
  departments: { id: string; name: string; headcount: number; currencies: MoneyLine[] }[];
  countries: { country: string; headcount: number; currencies: MoneyLine[] }[];
  recentEmployees: { id: string; employeeCode: string; name: string; department: string; joiningDate: string; createdAt: string }[];
  recentRevisions: {
    id: string;
    employee: { id: string; employeeCode: string; name: string };
    currency: string;
    effectiveDate: string;
    gross: string;
    changePercent: string | null;
    reason: string;
    createdBy: { id: string; name: string };
    createdAt: string;
  }[];
}

export const getAnalyticsSummary = (r: Request, p: AnalyticsParams) => fetchAnalytics<SummaryData>(r, "/api/analytics/summary", p, ["asOf"]);
export const getAnalyticsDistribution = (r: Request, p: AnalyticsParams) => fetchAnalytics<DistributionData>(r, "/api/analytics/distribution", p, ["asOf"]);
export const getAnalyticsGroups = (r: Request, p: AnalyticsParams) => fetchAnalytics<GroupsData>(r, "/api/analytics/groups", p, ["asOf", "groupBy"]);
export const getAnalyticsTrends = (r: Request, p: AnalyticsParams) => fetchAnalytics<TrendsData>(r, "/api/analytics/trends", p, ["from", "to"]);
export const getAnalyticsFilters = (r: Request) => apiCall<FilterOptions>(r, "/api/analytics/filters");
export const getDashboard = (r: Request) => apiCall<DashboardData>(r, "/api/dashboard");
