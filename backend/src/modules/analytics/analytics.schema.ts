import { z } from "zod";

import { COUNTRY_CODES } from "../../lib/countries.ts";
import { CURRENCY_CODES } from "../../lib/currencies.ts";
import { todayUtc } from "./analytics.dates.ts";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => Number(value.slice(0, 4)) >= 1900, "Year must be 1900 or later")
  .refine((value) => new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value, "Not a real date");

const filterShape = {
  departmentId: z.uuid().optional(),
  country: z.enum(COUNTRY_CODES).optional(),
  designation: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ALL"]).default("ACTIVE"),
  currency: z.enum(CURRENCY_CODES).optional(),
  basis: z.enum(["gross", "net"]).default("gross"),
};

export const asOfQuerySchema = z
  .object({ ...filterShape, asOf: dateString.default(() => todayUtc()) })
  .strict();

export const groupsQuerySchema = z
  .object({
    ...filterShape,
    asOf: dateString.default(() => todayUtc()),
    groupBy: z.enum(["department", "country", "designation"]).default("department"),
  })
  .strict();

export const trendsQuerySchema = z
  .object({ ...filterShape, from: dateString.optional(), to: dateString.optional() })
  .strict();

export const emptyQuerySchema = z.object({}).strict();

export type AsOfQuery = z.infer<typeof asOfQuerySchema>;
export type GroupsQuery = z.infer<typeof groupsQuerySchema>;
export type TrendsQuery = z.infer<typeof trendsQuerySchema>;
