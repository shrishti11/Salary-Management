import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../app";
import { prisma } from "../../lib/prisma";
import { createTestUser, forgedCookie, loginAs } from "../../test/helpers";

const SUFFIX = randomUUID().slice(0, 8);
const USER_EMAIL = `sal-dir-${SUFFIX}@example.com`;
const ADMIN_EMAIL = `sal-dir-admin-${SUFFIX}@example.com`;
const P = `D${SUFFIX.toUpperCase()}`;

let deptA: string;
let deptB: string;
let userId: string;
let agent: Awaited<ReturnType<typeof loginAs>>;
const ids: Record<string, string> = {};

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const date = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function addSalary(
  employeeId: string,
  effectiveDate: string,
  components: { type: "BASE" | "ALLOWANCE" | "BONUS" | "DEDUCTION"; name: string; amount: string }[],
  currency = "USD",
) {
  await prisma.salaryRecord.create({
    data: { employeeId, currency, effectiveDate: date(effectiveDate), reason: `r-${effectiveDate}`, createdById: userId, components: { create: components } },
  });
}
const base = (amount: string) => [{ type: "BASE" as const, name: "Base salary", amount }];

beforeAll(async () => {
  userId = (await createTestUser(USER_EMAIL)).id;
  deptA = (await prisma.department.create({ data: { name: `Dir A ${SUFFIX}` } })).id;
  deptB = (await prisma.department.create({ data: { name: `Dir B ${SUFFIX}` } })).id;

  const rows = [
    { n: "001", first: "Asha", last: "Rao", dept: deptA, country: "IN", status: "ACTIVE" as const },
    { n: "002", first: "John", last: "Smith", dept: deptA, country: "US", status: "ACTIVE" as const },
    { n: "003", first: "Emma", last: "Wilson", dept: deptA, country: "US", status: "INACTIVE" as const },
    { n: "004", first: "Zed", last: "Adams", dept: deptB, country: "DE", status: "ACTIVE" as const },
    { n: "005", first: "Per_cent", last: "100%", dept: deptB, country: "IN", status: "ACTIVE" as const },
  ];
  for (const r of rows) {
    const e = await prisma.employee.create({
      data: {
        employeeCode: `${P}-${r.n}`,
        firstName: r.first,
        lastName: r.last,
        email: `${r.n}.${SUFFIX}@example.com`,
        departmentId: r.dept,
        designation: "Engineer",
        country: r.country,
        joiningDate: date("2015-01-01"),
        status: r.status,
      },
    });
    ids[r.n] = e.id;
  }
  // 001: older + current (with components) + scheduled
  await addSalary(ids["001"]!, "2018-01-01", base("1000.00"));
  await addSalary(ids["001"]!, "2020-06-01", [
    { type: "BASE", name: "Base salary", amount: "5000.50" },
    { type: "ALLOWANCE", name: "Housing", amount: "1000.25" },
    { type: "BONUS", name: "Spot", amount: "200.00" },
    { type: "DEDUCTION", name: "Tax", amount: "700.10" },
  ]);
  await addSalary(ids["001"]!, day(30), base("9000.00"));
  // 002: current only, later date
  await addSalary(ids["002"]!, "2022-03-01", base("2000.00"), "EUR");
  // 003 (inactive): none
  // 004: future only
  await addSalary(ids["004"]!, day(10), base("3000.00"));
  // 005: none
  agent = await loginAs(USER_EMAIL);
});

afterAll(async () => {
  const all = Object.values(ids);
  await prisma.salaryRecord.deleteMany({ where: { employeeId: { in: all } } });
  await prisma.employee.deleteMany({ where: { id: { in: all } } });
  await prisma.department.deleteMany({ where: { id: { in: [deptA, deptB] } } });
  await prisma.user.deleteMany({ where: { email: { in: [USER_EMAIL, ADMIN_EMAIL] } } });
  await prisma.$disconnect();
});

type Row = { employee: Record<string, unknown> & { employeeCode: string }; current: Record<string, unknown> | null; hasScheduled: boolean };
const list = (query: Record<string, string | number> = {}) => agent.get("/api/salaries").query({ q: P, ...query });
const codes = (body: { data: Row[] }) => body.data.map((r) => r.employee.employeeCode.slice(-3));
const rowFor = async (n: string, query: Record<string, string | number> = {}) => {
  const res = await list({ status: "ALL", ...query });
  return (res.body.data as Row[]).find((r) => r.employee.employeeCode.endsWith(n))!;
};

describe("auth", () => {
  it("401 without cookie", async () => {
    expect((await request(app).get("/api/salaries")).status).toBe(401);
  });
  it("403 for forged role", async () => {
    expect((await request(app).get("/api/salaries").set("Cookie", forgedCookie("VIEWER"))).status).toBe(403);
  });
  it("allows ADMIN", async () => {
    await createTestUser(ADMIN_EMAIL, "ADMIN");
    const admin = await loginAs(ADMIN_EMAIL);
    expect((await admin.get("/api/salaries").query({ q: P })).status).toBe(200);
  });
});

describe("status filter", () => {
  it("defaults to ACTIVE", async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(codes(res.body).sort()).toEqual(["001", "002", "004", "005"]);
  });
  it("supports ALL and INACTIVE", async () => {
    expect(codes((await list({ status: "ALL" })).body)).toHaveLength(5);
    expect(codes((await list({ status: "INACTIVE" })).body)).toEqual(["003"]);
  });
});

describe("row shape", () => {
  it("null current for employee without salary", async () => {
    const row = await rowFor("005");
    expect(row.current).toBeNull();
    expect(row.hasScheduled).toBe(false);
  });
  it("future-only employee has null current and hasScheduled", async () => {
    const row = await rowFor("004");
    expect(row.current).toBeNull();
    expect(row.hasScheduled).toBe(true);
  });
  it("current is the latest record <= today, with computed totals", async () => {
    const row = await rowFor("001");
    expect(row.hasScheduled).toBe(true);
    expect(row.current).toEqual({
      id: expect.any(String),
      currency: "USD",
      effectiveDate: "2020-06-01",
      gross: "6200.75",
      net: "5500.65",
      deductions: "700.10",
      reason: "r-2020-06-01",
    });
    expect(Object.keys(row).sort()).toEqual(["current", "employee", "hasScheduled"]);
    expect(Object.keys(row.employee).sort()).toEqual(
      ["country", "department", "email", "employeeCode", "firstName", "id", "lastName", "status"],
    );
    expect(row.employee.department).toEqual({ id: deptA, name: `Dir A ${SUFFIX}` });
  });
});

describe("filters", () => {
  it("salary=with / without", async () => {
    expect(codes((await list({ status: "ALL", salary: "with" })).body).sort()).toEqual(["001", "002"]);
    expect(codes((await list({ status: "ALL", salary: "without" })).body).sort()).toEqual(["003", "004", "005"]);
  });
  it("token search with escaped wildcards", async () => {
    const byName = await agent.get("/api/salaries").query({ q: `${P} smith asha`, status: "ALL" });
    expect(codes(byName.body)).toEqual([]);
    expect(codes((await agent.get("/api/salaries").query({ q: `${P} john smith` })).body)).toEqual(["002"]);
    expect(codes((await agent.get("/api/salaries").query({ q: `${P} 100%` })).body)).toEqual(["005"]);
    expect(codes((await agent.get("/api/salaries").query({ q: `${P} Per_cent` })).body)).toEqual(["005"]);
    expect(codes((await agent.get("/api/salaries").query({ q: `${P} %` })).body)).toEqual(["005"]);
  });
  it("department and country", async () => {
    expect(codes((await list({ departmentId: deptB })).body).sort()).toEqual(["004", "005"]);
    expect(codes((await list({ country: "US", status: "ALL" })).body).sort()).toEqual(["002", "003"]);
  });
});

describe("sorting", () => {
  const sorted = async (sortBy: string, sortOrder: string) => codes((await list({ status: "ALL", sortBy, sortOrder })).body);
  it("name", async () => {
    // last names: Adams(004) 100%(005) Rao(001) Smith(002) Wilson(003)
    expect(await sorted("name", "asc")).toEqual(["005", "004", "001", "002", "003"]);
    expect(await sorted("name", "desc")).toEqual(["003", "002", "001", "004", "005"]);
  });
  it("employeeCode", async () => {
    expect(await sorted("employeeCode", "asc")).toEqual(["001", "002", "003", "004", "005"]);
    expect(await sorted("employeeCode", "desc")).toEqual(["005", "004", "003", "002", "001"]);
  });
  it("department", async () => {
    const asc = await sorted("department", "asc");
    expect(asc.slice(0, 3).sort()).toEqual(["001", "002", "003"]);
    expect((await sorted("department", "desc")).slice(0, 2).sort()).toEqual(["004", "005"]);
  });
  it("country", async () => {
    const asc = await sorted("country", "asc");
    expect(asc[0]).toBe("004"); // DE
    expect(asc.slice(1, 3).sort()).toEqual(["001", "005"]); // IN
    expect((await sorted("country", "desc")).slice(0, 2).sort()).toEqual(["002", "003"]); // US
  });
  it("effectiveDate with nulls last in both directions", async () => {
    const asc = await sorted("effectiveDate", "asc");
    expect(asc.slice(0, 2)).toEqual(["001", "002"]);
    expect(asc.slice(2).sort()).toEqual(["003", "004", "005"]);
    const desc = await sorted("effectiveDate", "desc");
    expect(desc.slice(0, 2)).toEqual(["002", "001"]);
    expect(desc.slice(2).sort()).toEqual(["003", "004", "005"]);
  });
});

describe("pagination", () => {
  for (const sortBy of ["name", "effectiveDate"]) {
    it(`is stable across pages when sorting by ${sortBy}`, async () => {
      const p1 = await list({ status: "ALL", sortBy, pageSize: 3, page: 1 });
      const p2 = await list({ status: "ALL", sortBy, pageSize: 3, page: 2 });
      expect(p1.body.pagination).toEqual({ page: 1, pageSize: 3, total: 5, totalPages: 2 });
      const all = [...codes(p1.body), ...codes(p2.body)];
      expect(all).toHaveLength(5);
      expect(new Set(all).size).toBe(5);
    });
  }
});

describe("validation", () => {
  it.each<Record<string, string | number>>([
    { pageSize: 101 },
    { bogus: "1" },
    { sortBy: "gross" },
    { departmentId: "not-a-uuid" },
    { status: "DELETED" },
    { salary: "maybe" },
    { country: "ZZ" },
    { page: 0 },
  ])("400 for %j", async (query) => {
    expect((await list(query)).status).toBe(400);
  });
});
