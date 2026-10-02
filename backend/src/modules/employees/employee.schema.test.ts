import { describe, expect, it } from "vitest";

import {
  createEmployeeSchema,
  idParamSchema,
  listEmployeesQuerySchema,
  statusSchema,
  updateEmployeeSchema,
} from "./employee.schema";

const DEPARTMENT_ID = "6f1c1a4e-3a53-4b2e-9a53-0d1b6c0f5a11";

const valid = {
  employeeCode: "emp-001",
  firstName: " Asha ",
  lastName: "Rao",
  email: " Asha.Rao@Example.COM ",
  departmentId: DEPARTMENT_ID,
  designation: "Engineer",
  country: "IN",
  joiningDate: "2024-01-15",
};

describe("createEmployeeSchema", () => {
  it("normalises code, names and email", () => {
    const parsed = createEmployeeSchema.parse(valid);
    expect(parsed.employeeCode).toBe("EMP-001");
    expect(parsed.firstName).toBe("Asha");
    expect(parsed.email).toBe("asha.rao@example.com");
    expect(parsed.phone).toBeUndefined();
  });

  it("turns an empty phone into null and accepts a formatted one", () => {
    expect(createEmployeeSchema.parse({ ...valid, phone: "" }).phone).toBeNull();
    expect(createEmployeeSchema.parse({ ...valid, phone: "+91 (98) 7654-3210" }).phone).toBe(
      "+91 (98) 7654-3210",
    );
  });

  it.each([
    ["missing firstName", { firstName: undefined }],
    ["blank designation", { designation: "   " }],
    ["bad email", { email: "nope" }],
    ["bad code chars", { employeeCode: "EMP 001!" }],
    ["code too long", { employeeCode: "A".repeat(33) }],
    ["bad phone", { phone: "abc" }],
    ["unsupported country", { country: "ZZ" }],
    ["lowercase country", { country: "in" }],
    ["non-uuid department", { departmentId: "123" }],
    ["malformed date", { joiningDate: "15/01/2024" }],
    ["impossible date", { joiningDate: "2024-02-30" }],
    ["future date", { joiningDate: "2999-01-01" }],
  ])("rejects %s", (_name, override) => {
    expect(createEmployeeSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it("accepts today as the joining date", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(createEmployeeSchema.safeParse({ ...valid, joiningDate: today }).success).toBe(true);
  });
});

describe("updateEmployeeSchema", () => {
  it("accepts a partial body", () => {
    expect(updateEmployeeSchema.parse({ designation: "Lead" })).toEqual({ designation: "Lead" });
  });

  it("rejects an empty body, employeeCode and status", () => {
    expect(updateEmployeeSchema.safeParse({}).success).toBe(false);
    expect(updateEmployeeSchema.safeParse({ employeeCode: "X1" }).success).toBe(false);
    expect(updateEmployeeSchema.safeParse({ status: "INACTIVE" }).success).toBe(false);
  });

  it("rejects blank values and clears phone with an empty string", () => {
    expect(updateEmployeeSchema.safeParse({ designation: "" }).success).toBe(false);
    expect(updateEmployeeSchema.parse({ phone: "" })).toEqual({ phone: null });
  });
});

describe("statusSchema and idParamSchema", () => {
  it("only allows ACTIVE and INACTIVE", () => {
    expect(statusSchema.safeParse({ status: "ACTIVE" }).success).toBe(true);
    expect(statusSchema.safeParse({ status: "FIRED" }).success).toBe(false);
  });

  it("requires a uuid id", () => {
    expect(idParamSchema.safeParse({ id: DEPARTMENT_ID }).success).toBe(true);
    expect(idParamSchema.safeParse({ id: "abc" }).success).toBe(false);
  });
});

describe("listEmployeesQuerySchema", () => {
  it("applies defaults and coerces numbers", () => {
    expect(listEmployeesQuerySchema.parse({})).toMatchObject({
      page: 1,
      pageSize: 20,
      sortBy: "employeeCode",
      sortOrder: "asc",
    });
    expect(listEmployeesQuerySchema.parse({ page: "3", pageSize: "50" })).toMatchObject({
      page: 3,
      pageSize: 50,
    });
  });

  it.each([
    { page: "0" },
    { page: "1.5" },
    { pageSize: "101" },
    { sortBy: "passwordHash" },
    { sortOrder: "up" },
    { status: "FIRED" },
    { country: "ZZ" },
    { departmentId: "x" },
    { unknown: "1" },
  ])("rejects %o", (query) => {
    expect(listEmployeesQuerySchema.safeParse(query).success).toBe(false);
  });
});
