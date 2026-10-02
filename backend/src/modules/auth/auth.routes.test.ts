import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

const TEST_EMAIL = "foundation-route-test@example.com";
const TEST_PASSWORD = "correct-horse-battery-staple";

describe("auth routes", () => {
  beforeAll(async () => {
    const passwordHash = await hashPassword(TEST_PASSWORD);
    await prisma.user.create({
      data: { email: TEST_EMAIL, passwordHash, name: "Route Test User", role: "ADMIN" },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { email: TEST_EMAIL } });
    await prisma.$disconnect();
  });

  it("logs in and sets a session cookie", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(TEST_EMAIL);
    expect(response.headers["set-cookie"]?.[0]).toMatch(/^session=/);
  });

  it("rejects invalid credentials with 401", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_EMAIL, password: "wrong" });

    expect(response.status).toBe(401);
  });

  it("rejects a malformed login body with 400", async () => {
    const response = await request(app).post("/api/auth/login").send({ email: "not-an-email" });

    expect(response.status).toBe(400);
  });

  it("returns the current user from /me when authenticated", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    const response = await agent.get("/api/auth/me");

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(TEST_EMAIL);
  });

  it("returns 401 from /me when not authenticated", async () => {
    const response = await request(app).get("/api/auth/me");
    expect(response.status).toBe(401);
  });

  it("clears the cookie on logout", async () => {
    const response = await request(app).post("/api/auth/logout");

    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"]?.[0]).toMatch(/^session=;/);
  });
});
