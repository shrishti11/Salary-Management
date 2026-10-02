import { describe, expect, it } from "vitest";

import { employeeFormSchema, localToday } from "./employee-form";

const valid = {
  employeeCode: "emp-1",
  firstName: "Asha",
  lastName: "Rao",
  email: "asha@example.com",
  phone: "",
  departmentId: "d1",
  designation: "Engineer",
  country: "IN",
  joiningDate: "2024-01-15",
};

describe("employeeFormSchema", () => {
  it("accepts a valid form with an empty phone", () => {
    expect(employeeFormSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["employeeCode", ""],
    ["firstName", "  "],
    ["email", "nope"],
    ["phone", "abc"],
    ["departmentId", ""],
    ["country", ""],
    ["joiningDate", ""],
    ["joiningDate", "2999-01-01"],
  ])("rejects an invalid %s (%j)", (field, value) => {
    const result = employeeFormSchema.safeParse({ ...valid, [field]: value });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]!.path[0]).toBe(field);
  });

  it("accepts today", () => {
    expect(employeeFormSchema.safeParse({ ...valid, joiningDate: localToday() }).success).toBe(true);
  });
});
