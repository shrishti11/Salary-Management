import { z } from "zod";

export function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export const employeeFormSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100, "Too long"),
  lastName: z.string().trim().min(1, "Last name is required").max(100, "Too long"),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email").max(254, "Too long"),
  phone: z
    .string()
    .trim()
    .refine((value) => value === "" || /^[0-9+\-() ]{7,20}$/.test(value), "Enter a valid phone number"),
  departmentId: z.string().min(1, "Select a department"),
  designation: z.string().trim().min(1, "Designation is required").max(100, "Too long"),
  country: z.string().min(1, "Select a country"),
  joiningDate: z
    .string()
    .min(1, "Joining date is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
    .refine((value) => value <= localToday(), "Joining date cannot be in the future"),
});

export type EmployeeFormValues = z.infer<typeof employeeFormSchema>;
