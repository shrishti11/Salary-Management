import type { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import { AppError } from "../../middleware/error.middleware.ts";
import type {
  CreateEmployeeInput,
  EmployeeStatusValue,
  UpdateEmployeeInput,
} from "./employee.schema.ts";

export const employeeInclude = { department: { select: { id: true, name: true } } } as const;

type EmployeeRow = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;

export function serializeEmployee(employee: EmployeeRow) {
  return {
    id: employee.id,
    employeeCode: employee.employeeCode,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    phone: employee.phone,
    departmentId: employee.departmentId,
    department: employee.department,
    designation: employee.designation,
    country: employee.country,
    joiningDate: employee.joiningDate.toISOString().slice(0, 10),
    status: employee.status,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
}

export type EmployeeDto = ReturnType<typeof serializeEmployee>;

const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

function prismaCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

const employeeNotFound = () => new AppError(404, "Employee not found", "EMPLOYEE_NOT_FOUND");

async function assertDepartmentExists(departmentId: string) {
  const department = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!department) {
    throw new AppError(400, "Department not found", "INVALID_DEPARTMENT");
  }
}

// The driver adapter does not reliably report which constraint failed, so look at the data.
async function duplicateError(email: string | undefined, employeeCode: string | undefined, excludeId?: string) {
  if (employeeCode) {
    const byCode = await prisma.employee.findFirst({
      where: { employeeCode, ...(excludeId && { NOT: { id: excludeId } }) },
      select: { id: true },
    });
    if (byCode) return new AppError(409, "Employee ID already exists", "DUPLICATE_EMPLOYEE_CODE");
  }
  if (email) {
    const byEmail = await prisma.employee.findFirst({
      where: { email, ...(excludeId && { NOT: { id: excludeId } }) },
      select: { id: true },
    });
    if (byEmail) return new AppError(409, "Email already in use", "DUPLICATE_EMAIL");
  }
  return new AppError(409, "Employee already exists", "DUPLICATE_EMPLOYEE");
}

export async function createEmployee(input: CreateEmployeeInput): Promise<EmployeeDto> {
  await assertDepartmentExists(input.departmentId);

  try {
    const employee = await prisma.employee.create({
      data: { ...input, phone: input.phone ?? null, joiningDate: toDate(input.joiningDate) },
      include: employeeInclude,
    });
    return serializeEmployee(employee);
  } catch (error) {
    if (prismaCode(error) === "P2002") {
      throw await duplicateError(input.email, input.employeeCode);
    }
    throw error;
  }
}

export async function getEmployee(id: string): Promise<EmployeeDto> {
  const employee = await prisma.employee.findUnique({ where: { id }, include: employeeInclude });
  if (!employee) throw employeeNotFound();
  return serializeEmployee(employee);
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput): Promise<EmployeeDto> {
  if (input.departmentId) await assertDepartmentExists(input.departmentId);

  const { joiningDate, ...rest } = input;

  try {
    const employee = await prisma.employee.update({
      where: { id },
      data: { ...rest, ...(joiningDate && { joiningDate: toDate(joiningDate) }) },
      include: employeeInclude,
    });
    return serializeEmployee(employee);
  } catch (error) {
    const code = prismaCode(error);
    if (code === "P2025") throw employeeNotFound();
    if (code === "P2002") throw await duplicateError(input.email, undefined, id);
    throw error;
  }
}

export async function setEmployeeStatus(id: string, status: EmployeeStatusValue): Promise<EmployeeDto> {
  try {
    const employee = await prisma.employee.update({
      where: { id },
      data: { status },
      include: employeeInclude,
    });
    return serializeEmployee(employee);
  } catch (error) {
    if (prismaCode(error) === "P2025") throw employeeNotFound();
    throw error;
  }
}
