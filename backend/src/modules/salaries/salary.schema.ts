import { z } from "zod";

import { CURRENCY_CODES } from "../../lib/currencies.ts";

// JPY and KRW have no minor unit: reject any non-zero fractional part ("5000", "5000.0" and "5000.00" are fine,
// "5000.50" is not). Keep identical to frontend/app/lib/salary-form.ts.
const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW"]);

export const COMPONENT_TYPES = ["BASE", "ALLOWANCE", "BONUS", "DEDUCTION"] as const;

const amountSchema = z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/, "Invalid amount");

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Invalid date");

const componentSchema = z
  .object({
    type: z.enum(COMPONENT_TYPES),
    name: z.string().trim().min(1).max(100),
    amount: amountSchema,
  })
  .strict();

export const createSalarySchema = z
  .object({
    currency: z.string().trim().toUpperCase().pipe(z.enum(CURRENCY_CODES)),
    effectiveDate: dateSchema,
    reason: z.string().trim().min(3).max(500).optional(),
    components: z.array(componentSchema).min(1).max(30),
  })
  .strict()
  .superRefine((value, ctx) => {
    const bases = value.components.filter((c) => c.type === "BASE");
    if (bases.length !== 1) ctx.addIssue({ code: "custom", message: "Exactly one BASE component is required", path: ["components"] });
    if (bases[0] && Number(bases[0].amount) <= 0) ctx.addIssue({ code: "custom", message: "Base salary must be greater than 0", path: ["components"] });
    if (ZERO_DECIMAL_CURRENCIES.has(value.currency) && value.components.some((c) => /\.\d*[1-9]/.test(c.amount))) {
      ctx.addIssue({ code: "custom", message: "JPY/KRW amounts cannot have decimals", path: ["components"] });
    }
    const seen = new Set<string>();
    for (const { type, name } of value.components) {
      const key = `${type}:${name.toLowerCase()}`;
      if (seen.has(key)) ctx.addIssue({ code: "custom", message: "Duplicate component", path: ["components"] });
      seen.add(key);
    }
  });

export type CreateSalaryInput = z.infer<typeof createSalarySchema>;

export const employeeIdParamSchema = z.object({ id: z.uuid() });
export const salaryParamsSchema = z.object({ id: z.uuid(), salaryId: z.uuid() });
