import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/prisma";
import { createTestUser, loginAs } from "../../test/helpers";

const SUFFIX = randomUUID().slice(0, 8);
const USER_EMAIL = `emp-list-${SUFFIX}@example.com`;
const P = `L${SUFFIX.toUpperCase()}`; // code prefix unique to this run

let deptA: string;
let deptB: string;
let agent: Awaited<ReturnType<typeof loginAs>>;

const date = (s: string) => new Date(`${s}T00:00:00.000Z`);

beforeAll(async () => {
  await createTestUser(USER_EMAIL);
  deptA = (await prisma.department.create({ data: { name: `List Dept A ${SUFFIX}` } })).id;
  deptB = (await prisma.department.create({ data: { name: `List Dept B ${SUFFIX}` } })).id;

  const rows = [
    { n: "001", first: "Asha", last: "Rao", dept: deptA, country: "IN", joined: "2020-01-01", status: "ACTIVE" as const, designation: "Engineer" },
    { n: "002", first: "John", last: "Smith", dept: deptA, country: "US", joined: "2021-02-01", status: "ACTIVE" as const, designation: "Analyst" },
    { n: "003", first: "Emma", last: "Wilson", dept: deptA, country: "US", joined: "2019-03-01", status: "INACTIVE" as const, designation: "Manager" },
    { n: "004", first: "Zed", last: "Adams", dept: deptA, country: "IN", joined: "2022-04-01", status: "ACTIVE" as const, designation: "Engineer" },
    { n: "005", first: "Maria", last: "Garcia", dept: deptA, country: "ES", joined: "2023-05-01", status: "ACTIVE" as const, designation: "Designer" },
    { n: "006", first: "Lars", last: "Meyer", dept: deptB, country: "DE", joined: "2018-06-01", status: "ACTIVE" as const, designation: "Sales Rep" },
    { n: "007", first: "Mei", last: "Tan", dept: deptB, country: "SG", joined: "2017-07-01", status: "INACTIVE" as const, designation: "Lead" },
  ];
  await prisma.employee.createMany({
    data: rows.map((r) => ({
      employeeCode: `${P}-${r.n}`,
      firstName: r.first,
      lastName: r.last,
      email: `${r.first}.${r.last}.${SUFFIX}@example.com`.toLowerCase(),
      departmentId: r.dept,
      designation: r.designation,
      country: r.country,
      joiningDate: date(r.joined),
      status: r.status,
    })),
  });
  agent = await loginAs(USER_EMAIL);
});

afterAll(async () => {
  await prisma.employee.deleteMany({ where: { departmentId: { in: [deptA, deptB] } } });
  await prisma.department.deleteMany({ where: { id: { in: [deptA, deptB] } } });
  await prisma.user.delete({ where: { email: USER_EMAIL } });
  await prisma.$disconnect();
});

const list = (query: Record<string, string | number>) =>
  agent.get("/api/employees").query({ departmentId: deptA, ...query });
const codes = (body: { data: { employeeCode: string }[] }) => body.data.map((e) => e.employeeCode.slice(-3));

describe("GET /api/employees", () => {
  it("returns data with pagination metadata", async () => {
    const response = await list({});
    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({ page: 1, pageSize: 20, total: 5, totalPages: 1 });
    expect(codes(response.body)).toEqual(["001", "002", "003", "004", "005"]);
    expect(response.body.data[0]).toMatchObject({ department: { name: `List Dept A ${SUFFIX}` }, joiningDate: "2020-01-01" });
  });

  it("paginates without overlap and keeps order stable", async () => {
    const p1 = await list({ pageSize: 2, page: 1 });
    const p2 = await list({ pageSize: 2, page: 2 });
    const p3 = await list({ pageSize: 2, page: 3 });
    expect(p1.body.pagination).toEqual({ page: 1, pageSize: 2, total: 5, totalPages: 3 });
    expect([...codes(p1.body), ...codes(p2.body), ...codes(p3.body)]).toEqual(["001", "002", "003", "004", "005"]);
  });

  it("returns an empty page, not an error, beyond the last page", async () => {
    const response = await list({ pageSize: 2, page: 99 });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.pagination.total).toBe(5);
  });

  it("filters by status, including inactive employees", async () => {
    expect(codes((await list({ status: "INACTIVE" })).body)).toEqual(["003"]);
    expect(codes((await list({ status: "ACTIVE" })).body)).toEqual(["001", "002", "004", "005"]);
  });

  it("filters by country and department", async () => {
    expect(codes((await list({ country: "US" })).body)).toEqual(["002", "003"]);
    const other = await agent.get("/api/employees").query({ departmentId: deptB });
    expect(codes(other.body)).toEqual(["006", "007"]);
  });

  it("searches by code, first name, last name, full name and email, case-insensitively", async () => {
    expect(codes((await list({ q: `${P}-003` })).body)).toEqual(["003"]);
    expect(codes((await list({ q: `${P.toLowerCase()}-003` })).body)).toEqual(["003"]);
    expect(codes((await list({ q: "asha" })).body)).toEqual(["001"]);
    expect(codes((await list({ q: "WILSON" })).body)).toEqual(["003"]);
    expect(codes((await list({ q: "john smith" })).body)).toEqual(["002"]);
    expect(codes((await list({ q: "smith john" })).body)).toEqual(["002"]);
    expect(codes((await list({ q: `maria.garcia.${SUFFIX}` })).body)).toEqual(["005"]);
  });

  it("combines search with filters", async () => {
    expect(codes((await list({ q: "a", country: "IN" })).body)).toEqual(["001", "004"]);
    expect((await list({ q: "asha", country: "US" })).body.data).toEqual([]);
  });

  it("treats % and _ in the search text literally", async () => {
    expect((await list({ q: "%" })).body.data).toEqual([]);
    expect((await list({ q: "_" })).body.data).toEqual([]);
  });

  it("sorts by name, joining date, department and status in both directions", async () => {
    expect(codes((await list({ sortBy: "name", sortOrder: "asc" })).body)).toEqual(["004", "005", "001", "002", "003"]);
    expect(codes((await list({ sortBy: "name", sortOrder: "desc" })).body)).toEqual(["003", "002", "001", "005", "004"]);
    expect(codes((await list({ sortBy: "joiningDate", sortOrder: "desc" })).body)).toEqual(["005", "004", "002", "001", "003"]);
    const statusAsc = (await list({ sortBy: "status", sortOrder: "asc" })).body.data;
    expect(statusAsc.at(-1).status).toBe("INACTIVE");
    const statusDesc = (await list({ sortBy: "status", sortOrder: "desc" })).body.data;
    expect(statusDesc[0].status).toBe("INACTIVE");
    const byDept = await agent
      .get("/api/employees")
      .query({ q: P, sortBy: "department", sortOrder: "desc" });
    expect(codes(byDept.body).slice(0, 2).sort()).toEqual(["006", "007"]);
  });

  it.each<Record<string, string | number>>([
    { sortBy: "passwordHash" },
    { pageSize: 1000 },
    { page: 0 },
    { status: "FIRED" },
    { country: "ZZ" },
    { unknown: "1" },
  ])("rejects invalid query %o with 400", async (bad) => {
    expect((await list(bad)).status).toBe(400);
  });
});
