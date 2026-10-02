import { describe, expect, it } from "vitest";

import { createSalarySchema, employeeIdParamSchema, salaryParamsSchema } from "./salary.schema.ts";

const base = { type: "BASE", name: "Base salary", amount: "1000" };
const ok = (o: Record<string, unknown> = {}) => ({
  currency: "USD",
  effectiveDate: "2025-01-01",
  reason: "Annual review",
  components: [base],
  ...o,
});
const fails = (input: unknown) => expect(createSalarySchema.safeParse(input).success).toBe(false);
const withAmount = (amount: string) => ok({ components: [{ ...base, amount }] });
const UUID = "123e4567-e89b-42d3-a456-426614174000";

describe("createSalarySchema", () => {
  it("accepts valid input", () => {
    expect(createSalarySchema.safeParse(ok()).success).toBe(true);
  });
  it("uppercases currency", () => {
    expect(createSalarySchema.parse(ok({ currency: "usd" })).currency).toBe("USD");
  });
  it("trims reason", () => {
    expect(createSalarySchema.parse(ok({ reason: "  Annual review  " })).reason).toBe("Annual review");
  });
  it("allows omitted reason", () => {
    const { reason: _reason, ...rest } = ok();
    const result = createSalarySchema.safeParse(rest);
    expect(result.success).toBe(true);
    expect(result.data?.reason).toBeUndefined();
  });
  it("rejects unsupported currency", () => fails(ok({ currency: "XXX" })));
  it("rejects impossible date", () => fails(ok({ effectiveDate: "2025-02-30" })));
  it("rejects non-ISO date", () => fails(ok({ effectiveDate: "01/01/2025" })));
  it("rejects too-short reason", () => fails(ok({ reason: "ab" })));
  it("rejects too-long reason", () => fails(ok({ reason: "a".repeat(501) })));
  it("rejects empty components", () => fails(ok({ components: [] })));
  it("rejects missing BASE", () =>
    fails(ok({ components: [{ type: "BONUS", name: "Bonus", amount: "10" }] })));
  it("rejects two BASE components", () =>
    fails(ok({ components: [base, { ...base, name: "Other base" }] })));
  it("rejects zero BASE amount", () => fails(withAmount("0")));
  it.each(["-5", "1e3", "5.555", "", "1234567890123"])("rejects amount %j", (amount) =>
    fails(withAmount(amount)),
  );
  it("rejects duplicate component", () =>
    fails(
      ok({
        components: [
          base,
          { type: "ALLOWANCE", name: "Housing", amount: "10" },
          { type: "ALLOWANCE", name: "Housing", amount: "20" },
        ],
      }),
    ));
  it("rejects case-insensitive duplicate component", () =>
    fails(
      ok({
        components: [
          base,
          { type: "ALLOWANCE", name: "Housing", amount: "10" },
          { type: "ALLOWANCE", name: "housing", amount: "20" },
        ],
      }),
    ));
  it("rejects 31 components", () =>
    fails(
      ok({
        components: [
          base,
          ...Array.from({ length: 30 }, (_, i) => ({ type: "BONUS", name: `Bonus ${i}`, amount: "1" })),
        ],
      }),
    ));
  it("rejects blank component name", () =>
    fails(ok({ components: [{ ...base, name: "   " }] })));
  it("rejects unknown top-level key", () => fails(ok({ extra: 1 })));
  it("rejects unknown component key", () => fails(ok({ components: [{ ...base, extra: 1 }] })));
  it("accepts the same name under different types", () => {
    const result = createSalarySchema.safeParse(
      ok({
        components: [
          base,
          { type: "ALLOWANCE", name: "Housing", amount: "10" },
          { type: "DEDUCTION", name: "Housing", amount: "5" },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });
});

describe("param schemas", () => {
  it("employeeIdParamSchema rejects non-uuid", () => {
    expect(employeeIdParamSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
    expect(employeeIdParamSchema.safeParse({ id: UUID }).success).toBe(true);
  });
  it("salaryParamsSchema requires both uuids", () => {
    expect(salaryParamsSchema.safeParse({ id: UUID }).success).toBe(false);
    expect(salaryParamsSchema.safeParse({ id: UUID, salaryId: "x" }).success).toBe(false);
    expect(salaryParamsSchema.safeParse({ id: UUID, salaryId: UUID }).success).toBe(true);
  });
});
