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

  const sampleSalaries = [
    { employeeCode: "EMP-0001", currency: "INR", records: [
      { date: "2021-03-15", reason: "Initial salary", base: "1800000.00", extras: [["ALLOWANCE", "Housing", "300000.00"], ["DEDUCTION", "Provident fund", "120000.00"]] },
      { date: "2023-04-01", reason: "Annual review", base: "2200000.00", extras: [["ALLOWANCE", "Housing", "360000.00"], ["BONUS", "Performance", "200000.00"], ["DEDUCTION", "Provident fund", "144000.00"]] },
    ] },
    { employeeCode: "EMP-0002", currency: "USD", records: [
      { date: "2020-07-01", reason: "Initial salary", base: "70000.00", extras: [] },
      { date: "2022-07-01", reason: "Promotion", base: "82000.00", extras: [["BONUS", "Signing", "5000.00"]] },
    ] },
    { employeeCode: "EMP-0003", currency: "GBP", records: [
      { date: "2019-11-20", reason: "Initial salary", base: "55000.00", extras: [["ALLOWANCE", "Transport", "2400.00"]] },
    ] },
    { employeeCode: "EMP-0004", currency: "EUR", records: [
      { date: "2022-01-10", reason: "Initial salary", base: "62000.00", extras: [["BONUS", "Signing", "3000.00"]] },
    ] },
    { employeeCode: "EMP-0005", currency: "SGD", records: [
      { date: "2018-05-02", reason: "Initial salary", base: "90000.00", extras: [] },
    ] },
  ] as const;
  for (const { employeeCode, currency, records } of sampleSalaries) {
    const employee = await prisma.employee.findUnique({ where: { employeeCode } });
    if (!employee) continue;
    if ((await prisma.salaryRecord.count({ where: { employeeId: employee.id } })) > 0) continue;
    for (const record of records) {
      await prisma.salaryRecord.create({
        data: {
          employeeId: employee.id,
          currency,
          effectiveDate: new Date(`${record.date}T00:00:00.000Z`),
          reason: record.reason,
          createdById: user.id,
          components: {
            create: [
              { type: "BASE", name: "Base salary", amount: record.base },
              ...record.extras.map(([type, name, amount]) => ({ type, name, amount })),
            ],
          },
        },
      });
    }
  }
  console.log("Seeded sample salary records");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
