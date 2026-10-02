import { z } from "zod";

import type { Salary, SalaryPayload } from "~/lib/salaries-api";

const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;
const AMOUNT_MESSAGE = "Enter an amount like 5000 or 5000.50";
// JPY and KRW have no minor unit: reject any non-zero fractional part ("5000", "5000.0" and "5000.00" are fine,
// "5000.50" is not). Keep identical to backend/src/modules/salaries/salary.schema.ts.
const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW"]);
const ZERO_DECIMAL_MESSAGE = "JPY/KRW amounts cannot have decimals";
const hasFraction = (amount: string) => /\.\d*[1-9]/.test(amount);
export const MAX_EXTRAS = 29;
export const EXTRA_TYPES = ["ALLOWANCE", "BONUS", "DEDUCTION"] as const;

export type SalaryFormValues = {
  currency: string;
  effectiveDate: string;
  reason: string;
  baseAmount: string;
  extras: { type: (typeof EXTRA_TYPES)[number]; name: string; amount: string }[];
};

const cents = (amount: string) => {
  const [whole = "0", fraction = ""] = amount.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
};
const format = (value: number) =>
  `${Math.floor(Math.abs(value) / 100)}.${String(Math.abs(value) % 100).padStart(2, "0")}`;

export function computeFormTotals(values: Pick<SalaryFormValues, "baseAmount" | "extras">) {
  const amounts = [values.baseAmount.trim(), ...values.extras.map((e) => e.amount.trim())];
  if (!amounts.every((a) => AMOUNT.test(a))) return null;
  let earnings = cents(amounts[0]!);
  let deductions = 0;
  values.extras.forEach((extra, i) => {
    const value = cents(amounts[i + 1]!);
    if (extra.type === "DEDUCTION") deductions += value;
    else earnings += value;
  });
  const net = earnings - deductions;
  return { gross: format(earnings), deductions: format(deductions), net: `${net < 0 ? "-" : ""}${format(net)}` };
}

export function makeSalaryFormSchema(mode: "initial" | "revise") {
  const baseReason = z.string().trim().max(500, "Too long");
  const reason =
    mode === "revise"
      ? baseReason.min(3, "Reason is required (at least 3 characters)")
      : baseReason.refine((v) => v === "" || v.length >= 3, "Reason must be at least 3 characters");

  return z
    .object({
      currency: z.string().min(1, "Select a currency"),
      effectiveDate: z
        .string()
        .min(1, "Effective date is required")
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
      reason,
      baseAmount: z.string().trim().regex(AMOUNT, AMOUNT_MESSAGE),
      extras: z
        .array(
          z.object({
            type: z.enum(EXTRA_TYPES),
            name: z.string().trim().min(1, "Name is required").max(100, "Too long"),
            amount: z.string().trim().regex(AMOUNT, AMOUNT_MESSAGE),
          }),
        )
        .max(MAX_EXTRAS, `At most ${MAX_EXTRAS} additional components`),
    })
    .superRefine((values, ctx) => {
      const base = values.baseAmount.trim();
      if (AMOUNT.test(base) && cents(base) <= 0) {
        ctx.addIssue({ code: "custom", path: ["baseAmount"], message: "Base salary must be greater than 0" });
      }
      if (ZERO_DECIMAL_CURRENCIES.has(values.currency)) {
        if (hasFraction(base)) ctx.addIssue({ code: "custom", path: ["baseAmount"], message: ZERO_DECIMAL_MESSAGE });
        values.extras.forEach((extra, index) => {
          if (hasFraction(extra.amount.trim())) {
            ctx.addIssue({ code: "custom", path: ["extras", index, "amount"], message: ZERO_DECIMAL_MESSAGE });
          }
        });
      }
      const seen = new Set<string>();
      values.extras.forEach((extra, index) => {
        const key = `${extra.type}:${extra.name.trim().toLowerCase()}`;
        if (seen.has(key)) {
          ctx.addIssue({ code: "custom", path: ["extras", index, "name"], message: "Duplicate component" });
        }
        seen.add(key);
      });
      const totals = computeFormTotals(values);
      if (totals && totals.net.startsWith("-")) {
        ctx.addIssue({ code: "custom", path: ["baseAmount"], message: "Deductions cannot exceed total earnings" });
      }
    });
}

export function toPayload(values: SalaryFormValues): SalaryPayload {
  const reason = values.reason.trim();
  return {
    currency: values.currency,
    effectiveDate: values.effectiveDate,
    ...(reason && { reason }),
    components: [
      { type: "BASE", name: "Base salary", amount: values.baseAmount.trim() },
      ...values.extras.map((e) => ({ type: e.type, name: e.name.trim(), amount: e.amount.trim() })),
    ],
  };
}

export function valuesFromSalary(salary: Salary): SalaryFormValues {
  const base = salary.components.find((c) => c.type === "BASE");
  return {
    currency: salary.currency,
    effectiveDate: "",
    reason: "",
    baseAmount: base?.amount ?? "",
    extras: salary.components
      .filter((c): c is typeof c & { type: (typeof EXTRA_TYPES)[number] } => c.type !== "BASE")
      .map((c) => ({ type: c.type, name: c.name, amount: c.amount })),
  };
}

/** Next calendar day as YYYY-MM-DD (UTC arithmetic, so no DST/timezone drift). */
export function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
