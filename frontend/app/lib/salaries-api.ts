import { type ApiResult, apiCall } from "~/lib/employees-api";

export type SalaryComponentType = "BASE" | "ALLOWANCE" | "BONUS" | "DEDUCTION";

export interface SalaryComponent {
  id: string;
  type: SalaryComponentType;
  name: string;
  amount: string;
}

export interface Salary {
  id: string;
  employeeId: string;
  currency: string;
  effectiveDate: string;
  reason: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
  components: SalaryComponent[];
  totals: { gross: string; deductions: string; net: string };
  changeFromPrevious: { gross: string; net: string; grossPercent: string | null } | null;
  status: "CURRENT" | "SCHEDULED" | "PREVIOUS";
}

export interface SalaryOverview {
  current: Salary | null;
  scheduled: Salary | null;
  history: Salary[];
}

export interface SalaryPayload {
  currency: string;
  effectiveDate: string;
  reason?: string;
  components: { type: SalaryComponentType; name: string; amount: string }[];
}

export function getSalaries(request: Request, employeeId: string): Promise<ApiResult<SalaryOverview>> {
  return apiCall<SalaryOverview>(request, `/api/employees/${employeeId}/salaries`);
}

export function createSalary(
  request: Request,
  employeeId: string,
  payload: SalaryPayload,
): Promise<ApiResult<{ salary: Salary }>> {
  return apiCall<{ salary: Salary }>(request, `/api/employees/${employeeId}/salaries`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

type SalaryField = "effectiveDate" | "reason" | "baseAmount";

const FIELD_BY_CODE: Record<string, SalaryField> = {
  DUPLICATE_EFFECTIVE_DATE: "effectiveDate",
  EFFECTIVE_DATE_NOT_AFTER_LATEST: "effectiveDate",
  EFFECTIVE_DATE_BEFORE_JOINING: "effectiveDate",
  REASON_REQUIRED: "reason",
  NEGATIVE_NET: "baseAmount",
};

export function toSalaryFormError(result: Extract<ApiResult<unknown>, { ok: false }>): {
  message: string;
  field?: SalaryField;
} {
  const field = result.code ? FIELD_BY_CODE[result.code] : undefined;
  return field ? { message: result.message, field } : { message: result.message };
}
