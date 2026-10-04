import { redirect } from "react-router";

import { apiFetchAs } from "~/lib/api-client";
import type { EmployeeFormValues } from "~/lib/employee-form";

export type EmployeeStatus = "ACTIVE" | "INACTIVE";
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

export type EmployeeInput = EmployeeFormValues;

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code?: string; message: string };

export interface FormError {
  message: string;
  field?: "employeeCode" | "email" | "departmentId";
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
