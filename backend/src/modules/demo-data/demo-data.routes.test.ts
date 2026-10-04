import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../app";
import { prisma } from "../../lib/prisma";
import { createTestUser, loginAs } from "../../test/helpers";

const SUFFIX = randomUUID().slice(0, 8);
const ADMIN = `demo-admin-${SUFFIX}@example.com`;
const HR = `demo-hr-${SUFFIX}@example.com`;

let admin: Awaited<ReturnType<typeof loginAs>>;
let hr: Awaited<ReturnType<typeof loginAs>>;

beforeAll(async () => {
  await createTestUser(ADMIN, "ADMIN");
  await createTestUser(HR, "HR_MANAGER");
  admin = await loginAs(ADMIN);
  hr = await loginAs(HR);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [ADMIN, HR] } } });
  await prisma.$disconnect();
});

describe("demo-data routes", () => {
  it("requires a session", async () => {
    expect((await request(app).get("/api/demo-data")).status).toBe(401);
    expect((await request(app).post("/api/demo-data/seed")).status).toBe(401);
    expect((await request(app).post("/api/demo-data/reseed")).status).toBe(401);
  });

  it("lets HR managers read the status but only admins seed", async () => {
    const status = await hr.get("/api/demo-data");
    expect(status.status).toBe(200);
    expect(status.body).toEqual({ seeded: expect.any(Boolean), count: expect.any(Number), target: 10000 });
    expect((await hr.post("/api/demo-data/seed")).status).toBe(403);
    expect((await hr.post("/api/demo-data/reseed")).status).toBe(403);
  });

  it("seeds only the demo target: an already-seeded company is a no-op over HTTP", async () => {
    const before = await admin.get("/api/demo-data");
    if (!before.body.seeded) return; // seeding 10,000 rows is covered at small scale in the service test
    const response = await admin.post("/api/demo-data/seed");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ created: false, count: before.body.count });
  });
});
