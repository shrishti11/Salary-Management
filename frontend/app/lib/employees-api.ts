import { redirect } from "react-router";

import { apiFetchAs } from "~/lib/api-client";
import { COUNTRIES } from "~/lib/countries";
import type { EmployeeFormValues } from "~/lib/employee-form";

export type EmployeeStatus = "ACTIVE" | "INACTIVE";
export const SORT_FIELDS = [
  "employeeCode",
  "name",
  "department",
  "designation",
  "country",
  "joiningDate",
  "status",
] as const;
export type SortField = (typeof SORT_FIELDS)[number];
export type SortOrder = "asc" | "desc";
export const PAGE_SIZES = [10, 20, 50] as const;

export interface Department {
  id: string;
  name: string;
}

export interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  departmentId: string;
  department: Department;
  designation: string;
  country: string;
  joiningDate: string;
  status: EmployeeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListParams {
  page: number;
  pageSize: number;
  q: string;
  departmentId: string;
  country: string;
  status: "" | EmployeeStatus;
  sortBy: SortField;
  sortOrder: SortOrder;
}

export const DEFAULT_LIST_PARAMS: ListParams = {
  page: 1,
  pageSize: 20,
  q: "",
  departmentId: "",
  country: "",
  status: "",
  sortBy: "employeeCode",
  sortOrder: "asc",
};

export type EmployeeInput = EmployeeFormValues;

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code?: string; message: string };

export interface FormError {
  message: string;
  field?: "employeeCode" | "email" | "departmentId";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads list state from the URL; anything invalid falls back to the default. */
export function parseListParams(searchParams: URLSearchParams): ListParams {
  const page = Number(searchParams.get("page"));
  const pageSize = Number(searchParams.get("pageSize"));
  const country = searchParams.get("country") ?? "";
  const status = searchParams.get("status");
  const sortBy = searchParams.get("sortBy");
  const sortOrder = searchParams.get("sortOrder");
  const departmentId = searchParams.get("departmentId") ?? "";

  return {
    page: Number.isInteger(page) && page >= 1 ? page : DEFAULT_LIST_PARAMS.page,
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : DEFAULT_LIST_PARAMS.pageSize,
    q: (searchParams.get("q") ?? "").trim().slice(0, 100),
    departmentId: UUID.test(departmentId) ? departmentId : "",
    country: COUNTRIES.some((c) => c.code === country) ? country : "",
    status: status === "ACTIVE" || status === "INACTIVE" ? status : "",
    sortBy: (SORT_FIELDS as readonly string[]).includes(sortBy ?? "") ? (sortBy as SortField) : DEFAULT_LIST_PARAMS.sortBy,
    sortOrder: sortOrder === "asc" || sortOrder === "desc" ? sortOrder : DEFAULT_LIST_PARAMS.sortOrder,
  };
}

/** Serialises list state, omitting empty values and defaults (the backend defaults match). */
export function toSearchParams(params: Partial<ListParams>): URLSearchParams {
  const merged = { ...DEFAULT_LIST_PARAMS, ...params };
  const search = new URLSearchParams();
  for (const key of Object.keys(DEFAULT_LIST_PARAMS) as (keyof ListParams)[]) {
    const value = merged[key];
    if (value === "" || value === DEFAULT_LIST_PARAMS[key]) continue;
    search.set(key, String(value));
  }
  return search;
}

export async function apiCall<T>(request: Request, path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const response = await apiFetchAs(request, path, init);

  if (response.status === 401) throw redirect("/login");

  if (response.ok) return { ok: true, data: (await response.json()) as T };

  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string; code?: string };
  } | null;
  return {
    ok: false,
    status: response.status,
    code: body?.error?.code,
    message: body?.error?.message ?? "Request failed",
  };
}

export function listEmployees(request: Request, params: ListParams) {
  const query = toSearchParams(params).toString();
  return apiCall<{ data: Employee[]; pagination: Pagination }>(
    request,
    `/api/employees${query ? `?${query}` : ""}`,
  );
}

export function listDepartments(request: Request) {
  return apiCall<{ departments: Department[] }>(request, "/api/departments");
}

export function getEmployee(request: Request, id: string) {
  return apiCall<{ employee: Employee }>(request, `/api/employees/${id}`);
}

export function createEmployee(request: Request, input: EmployeeInput) {
  return apiCall<{ employee: Employee }>(request, "/api/employees", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateEmployee(request: Request, id: string, input: Partial<EmployeeInput>) {
  return apiCall<{ employee: Employee }>(request, `/api/employees/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function setEmployeeStatus(request: Request, id: string, status: EmployeeStatus) {
  return apiCall<{ employee: Employee }>(request, `/api/employees/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

const FIELD_BY_CODE: Record<string, NonNullable<FormError["field"]>> = {
  DUPLICATE_EMPLOYEE_CODE: "employeeCode",
  DUPLICATE_EMAIL: "email",
  INVALID_DEPARTMENT: "departmentId",
};

export function toFormError(result: Extract<ApiResult<unknown>, { ok: false }>): FormError {
  const field = result.code ? FIELD_BY_CODE[result.code] : undefined;
  return field ? { message: result.message, field } : { message: result.message };
}
