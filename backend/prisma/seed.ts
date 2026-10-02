import { existsSync } from "node:fs";

import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../generated/prisma/client.ts";

// tsx does not load .env on its own.
if (existsSync(".env")) process.loadEnvFile(".env");

const DEV_ADMIN_EMAIL = "admin@salary-management.local";
const DEV_ADMIN_PASSWORD = "ChangeMe123!";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const passwordHash = await bcrypt.hash(DEV_ADMIN_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: DEV_ADMIN_EMAIL },
    update: {},
    create: {
      email: DEV_ADMIN_EMAIL,
      passwordHash,
      name: "Dev Admin",
      role: "ADMIN",
    },
  });

  console.log(`Seeded admin user: ${user.email} (password: ${DEV_ADMIN_PASSWORD})`);

  const departmentNames = [
    "Engineering",
    "Human Resources",
    "Finance",
    "Sales",
    "Marketing",
    "Operations",
  ];
  const departments = new Map<string, string>();
  for (const name of departmentNames) {
    const department = await prisma.department.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    departments.set(name, department.id);
  }

  const sampleEmployees = [
    { employeeCode: "EMP-0001", firstName: "Asha", lastName: "Rao", email: "asha.rao@example.com", department: "Engineering", designation: "Senior Engineer", country: "IN", joiningDate: "2021-03-15" },
    { employeeCode: "EMP-0002", firstName: "John", lastName: "Smith", email: "john.smith@example.com", department: "Finance", designation: "Financial Analyst", country: "US", joiningDate: "2020-07-01" },
    { employeeCode: "EMP-0003", firstName: "Emma", lastName: "Wilson", email: "emma.wilson@example.com", department: "Human Resources", designation: "HR Manager", country: "GB", joiningDate: "2019-11-20" },
    { employeeCode: "EMP-0004", firstName: "Lars", lastName: "Meyer", email: "lars.meyer@example.com", department: "Sales", designation: "Account Executive", country: "DE", joiningDate: "2022-01-10" },
    { employeeCode: "EMP-0005", firstName: "Mei", lastName: "Tan", email: "mei.tan@example.com", department: "Operations", designation: "Operations Lead", country: "SG", joiningDate: "2018-05-02", status: "INACTIVE" as const },
  ];
  for (const { department, joiningDate, ...rest } of sampleEmployees) {
    await prisma.employee.upsert({
      where: { employeeCode: rest.employeeCode },
      update: {},
      create: {
        ...rest,
        departmentId: departments.get(department)!,
        joiningDate: new Date(`${joiningDate}T00:00:00.000Z`),
      },
    });
  }
  console.log(`Seeded ${departmentNames.length} departments and ${sampleEmployees.length} employees`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
