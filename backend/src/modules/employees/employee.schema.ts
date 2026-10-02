import { z } from "zod";

import { COUNTRY_CODES } from "../../lib/countries.ts";

export const EMPLOYEE_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type EmployeeStatusValue = (typeof EMPLOYEE_STATUSES)[number];

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

const requiredText = (max: number) => z.string().trim().min(1).max(max);

const phoneSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .refine((value) => value === null || /^[0-9+\-() ]{7,20}$/.test(value), "Invalid phone number");

const joiningDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Invalid date")
  .refine((value) => value <= new Date().toISOString().slice(0, 10), "Joining date cannot be in the future");

export const createEmployeeSchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .toUpperCase()
    .min(1)
    .max(32)
    .regex(/^[A-Z0-9_-]+$/),
  firstName: requiredText(100),
  lastName: requiredText(100),
  email: z.string().trim().toLowerCase().max(254).email(),
  phone: phoneSchema.optional(),
  departmentId: z.uuid(),
  designation: requiredText(100),
  country: z.enum(COUNTRY_CODES),
  joiningDate: joiningDateSchema,
});

export const updateEmployeeSchema = createEmployeeSchema
  .omit({ employeeCode: true })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const statusSchema = z.object({ status: z.enum(EMPLOYEE_STATUSES) });

export const idParamSchema = z.object({ id: z.uuid() });

export const listEmployeesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().max(100).optional(),
    departmentId: z.uuid().optional(),
    country: z.enum(COUNTRY_CODES).optional(),
    status: z.enum(EMPLOYEE_STATUSES).optional(),
    sortBy: z.enum(SORT_FIELDS).default("employeeCode"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;
