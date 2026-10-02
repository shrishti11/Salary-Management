import { describe, expect, it } from "vitest";

import type { Salary } from "./salaries-api";
import {
  type SalaryFormValues,
  computeFormTotals,
  makeSalaryFormSchema,
  nextDay,
  toPayload,
  valuesFromSalary,
} from "./salary-form";

const valid = (over: Partial<SalaryFormValues> = {}): SalaryFormValues => ({
  currency: "USD",
  effectiveDate: "2024-01-01",
  reason: "",
  baseAmount: "1000",
  extras: [],
  ...over,
});

describe("computeFormTotals", () => {
  it("sums in cents", () => {
    expect(
      computeFormTotals({
        baseAmount: "1000",
        extras: [
          { type: "ALLOWANCE", name: "a", amount: "200.10" },
          { type: "BONUS", name: "b", amount: "99.90" },
          { type: "DEDUCTION", name: "c", amount: "300" },
        ],
      }),
    ).toEqual({ gross: "1300.00", deductions: "300.00", net: "1000.00" });
  });

  it("returns null for invalid amounts", () => {
    expect(computeFormTotals({ baseAmount: "abc", extras: [] })).toBeNull();
  });
});

describe("makeSalaryFormSchema", () => {
  const initial = makeSalaryFormSchema("initial");
  const revise = makeSalaryFormSchema("revise");

  it("accepts empty reason in initial mode", () => {
    expect(initial.safeParse(valid()).success).toBe(true);
  });

  it("rejects short or empty reason in revise mode", () => {
    expect(revise.safeParse(valid({ reason: "ab" })).success).toBe(false);
    expect(revise.safeParse(valid({ reason: "" })).success).toBe(false);
    expect(revise.safeParse(valid({ reason: "Promotion" })).success).toBe(true);
  });

  it("rejects short non-empty reason in initial mode", () => {
    expect(initial.safeParse(valid({ reason: "ab" })).success).toBe(false);
  });

  it.each(["0", "1e3", "5.555"])("rejects base %s", (baseAmount) => {
    expect(initial.safeParse(valid({ baseAmount })).success).toBe(false);
  });

  it("rejects duplicate extras case-insensitively", () => {
    const result = initial.safeParse(
      valid({
        extras: [
          { type: "BONUS", name: "Joining", amount: "10" },
          { type: "BONUS", name: "joining", amount: "10" },
        ],
      }),
    );
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues.some((i) => i.path.join(".") === "extras.1.name")).toBe(true);
  });

  it("rejects negative net on baseAmount", () => {
    const result = initial.safeParse(valid({ extras: [{ type: "DEDUCTION", name: "Tax", amount: "2000" }] }));
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues.some((i) => i.path.join(".") === "baseAmount")).toBe(true);
  });

  it("requires currency and effectiveDate", () => {
    expect(initial.safeParse(valid({ currency: "" })).success).toBe(false);
    expect(initial.safeParse(valid({ effectiveDate: "" })).success).toBe(false);
  });

  it("rejects extra with empty name", () => {
    expect(initial.safeParse(valid({ extras: [{ type: "BONUS", name: " ", amount: "10" }] })).success).toBe(false);
  });
});

describe("toPayload", () => {
  it("puts BASE first and omits empty reason", () => {
    const payload = toPayload(valid({ extras: [{ type: "BONUS", name: " Joining ", amount: " 10 " }] }));
    expect(payload).toEqual({
      currency: "USD",
      effectiveDate: "2024-01-01",
      components: [
        { type: "BASE", name: "Base salary", amount: "1000" },
        { type: "BONUS", name: "Joining", amount: "10" },
      ],
    });
    expect("reason" in payload).toBe(false);
  });

  it("includes a trimmed reason", () => {
    expect(toPayload(valid({ reason: " Promotion " })).reason).toBe("Promotion");
  });
});

describe("valuesFromSalary", () => {
  it("maps components and blanks date/reason", () => {
    const salary = {
      currency: "EUR",
      effectiveDate: "2024-01-01",
      reason: "x",
      components: [
        { id: "1", type: "BASE", name: "Base salary", amount: "5000.00" },
        { id: "2", type: "ALLOWANCE", name: "Housing", amount: "500.00" },
      ],
    } as unknown as Salary;
    expect(valuesFromSalary(salary)).toEqual({
      currency: "EUR",
      effectiveDate: "",
      reason: "",
      baseAmount: "5000.00",
      extras: [{ type: "ALLOWANCE", name: "Housing", amount: "500.00" }],
    });
  });
});

describe("nextDay", () => {
  it("handles month, leap and year rollover", () => {
    expect(nextDay("2024-02-28")).toBe("2024-02-29");
    expect(nextDay("2023-02-28")).toBe("2023-03-01");
    expect(nextDay("2024-12-31")).toBe("2025-01-01");
    expect(nextDay("2024-01-09")).toBe("2024-01-10");
  });
});
