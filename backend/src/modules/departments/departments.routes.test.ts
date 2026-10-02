import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../app";
import { prisma } from "../../lib/prisma";
import { createTestUser, loginAs } from "../../test/helpers";

const SUFFIX = randomUUID().slice(0, 8);
const USER_EMAIL = `dept-routes-${SUFFIX}@example.com`;

beforeAll(async () => {
  await createTestUser(USER_EMAIL);
  await prisma.department.create({ data: { name: `AAA Test Dept ${SUFFIX}` } });
});

afterAll(async () => {
  await prisma.department.deleteMany({ where: { name: `AAA Test Dept ${SUFFIX}` } });
  await prisma.user.delete({ where: { email: USER_EMAIL } });
  await prisma.$disconnect();
});

describe("GET /api/departments", () => {
  it("requires authentication", async () => {
    expect((await request(app).get("/api/departments")).status).toBe(401);
  });

  it("lists departments sorted by name", async () => {
    const agent = await loginAs(USER_EMAIL);
    const response = await agent.get("/api/departments");
    expect(response.status).toBe(200);
    const names = (response.body.departments as { id: string; name: string }[]).map((d) => d.name);
    expect(names).toContain(`AAA Test Dept ${SUFFIX}`);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(Object.keys(response.body.departments[0]).sort()).toEqual(["id", "name"]);
  });
});
