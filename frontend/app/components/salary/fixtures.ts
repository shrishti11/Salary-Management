import type { Salary } from "~/lib/salaries-api";

export function makeSalary(overrides: Partial<Salary> = {}): Salary {
  return {
    id: "s1",
    employeeId: "e1",
    currency: "USD",
    effectiveDate: "2026-01-01",
    reason: "Annual review",
    createdAt: "2026-01-01T00:00:00Z",
    createdBy: { id: "u1", name: "Hannah HR" },
    components: [
      { id: "c1", type: "BASE", name: "Base salary", amount: "5000.00" },
      { id: "c2", type: "ALLOWANCE", name: "Housing", amount: "500.00" },
      { id: "c3", type: "DEDUCTION", name: "Tax", amount: "700.00" },
    ],
    totals: { gross: "5500.00", deductions: "700.00", net: "4800.00" },
    changeFromPrevious: null,
    status: "CURRENT",
    ...overrides,
  };
}
