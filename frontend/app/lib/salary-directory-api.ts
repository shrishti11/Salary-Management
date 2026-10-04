import { COUNTRIES } from "~/lib/countries";
import { PAGE_SIZES, apiCall, type EmployeeStatus, type Pagination, type SortOrder } from "~/lib/employees-api";

export const SALARY_SORT_FIELDS = ["name", "employeeCode", "department", "country", "joiningDate", "effectiveDate"] as const;
export type SalarySortField = (typeof SALARY_SORT_FIELDS)[number];
export type SalaryStatusFilter = EmployeeStatus | "ALL";
export type SalaryPresence = "" | "with" | "without";

export interface SalaryDirectoryRow {
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    email: string;
    department: { id: string; name: string };
    country: string;
    designation: string;
    joiningDate: string;
    status: EmployeeStatus;
  };
  current: null | {
    id: string;
    currency: string;
    effectiveDate: string;
    gross: string;
    net: string;
    deductions: string;
    reason: string | null;
  };
  hasScheduled: boolean;
}

export interface SalaryListParams {
  page: number;
  pageSize: number;
  q: string;
  departmentId: string;
  country: string;
  status: SalaryStatusFilter;
  salary: SalaryPresence;
  sortBy: SalarySortField;
  sortOrder: SortOrder;
}

// Defaults match the backend's, so default values are omitted from the URL.
export const DEFAULT_SALARY_LIST_PARAMS: SalaryListParams = {
  page: 1,
  pageSize: 20,
  q: "",
  departmentId: "",
  country: "",
  status: "ACTIVE",
  salary: "",
  sortBy: "name",
  sortOrder: "asc",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads directory state from the URL; anything invalid falls back to the default. */
export function parseSalaryListParams(searchParams: URLSearchParams): SalaryListParams {
  const page = Number(searchParams.get("page"));
  const pageSize = Number(searchParams.get("pageSize"));
  const country = searchParams.get("country") ?? "";
  const departmentId = searchParams.get("departmentId") ?? "";
  const status = searchParams.get("status");
  const salary = searchParams.get("salary");
  const sortBy = searchParams.get("sortBy");
  const sortOrder = searchParams.get("sortOrder");
  const defaults = DEFAULT_SALARY_LIST_PARAMS;

  return {
    page: Number.isInteger(page) && page >= 1 ? page : defaults.page,
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : defaults.pageSize,
    q: (searchParams.get("q") ?? "").trim().slice(0, 100),
    departmentId: UUID.test(departmentId) ? departmentId : "",
    country: COUNTRIES.some((c) => c.code === country) ? country : "",
    status: status === "ACTIVE" || status === "INACTIVE" || status === "ALL" ? status : defaults.status,
    salary: salary === "with" || salary === "without" ? salary : "",
    sortBy: (SALARY_SORT_FIELDS as readonly string[]).includes(sortBy ?? "") ? (sortBy as SalarySortField) : defaults.sortBy,
    sortOrder: sortOrder === "asc" || sortOrder === "desc" ? sortOrder : defaults.sortOrder,
  };
}

/** Serialises directory state, omitting empty values and defaults. */
export function toSalarySearchParams(params: Partial<SalaryListParams>): URLSearchParams {
  const merged = { ...DEFAULT_SALARY_LIST_PARAMS, ...params };
  const search = new URLSearchParams();
  for (const key of Object.keys(DEFAULT_SALARY_LIST_PARAMS) as (keyof SalaryListParams)[]) {
    const value = merged[key];
    if (value === "" || value === DEFAULT_SALARY_LIST_PARAMS[key]) continue;
    search.set(key, String(value));
  }
  return search;
}

export function listSalaryDirectory(request: Request, params: SalaryListParams) {
  const query = toSalarySearchParams(params).toString();
  return apiCall<{ data: SalaryDirectoryRow[]; pagination: Pagination }>(
    request,
    `/api/salaries${query ? `?${query}` : ""}`,
  );
}
