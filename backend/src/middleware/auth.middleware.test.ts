import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { env } from "../config/env";
import { signToken } from "../lib/jwt";
import { errorHandler } from "./error.middleware";
import { requireAuth, requireRole } from "./auth.middleware";

function buildTestApp() {
  const app = express();

  app.get("/protected", requireAuth, (request, response) => {
    response.json({ userId: request.user?.id, role: request.user?.role });
  });

  app.get("/admin-only", requireAuth, requireRole("ADMIN"), (_request, response) => {
    response.json({ ok: true });
  });

  app.use(errorHandler);

  return app;
}

describe("auth middleware", () => {
  it("rejects requests with no cookie", async () => {
    const response = await request(buildTestApp()).get("/protected");
    expect(response.status).toBe(401);
  });

  it("allows requests with a valid token cookie", async () => {
    const token = signToken({ sub: "user-1", role: "HR_MANAGER" });

    const response = await request(buildTestApp())
      .get("/protected")
      .set("Cookie", [`${env.COOKIE_NAME}=${token}`]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: "user-1", role: "HR_MANAGER" });
  });

  it("rejects requests with an invalid token cookie", async () => {
    const response = await request(buildTestApp())
      .get("/protected")
      .set("Cookie", [`${env.COOKIE_NAME}=garbage`]);

    expect(response.status).toBe(401);
  });

  it("rejects a role-restricted route when the role doesn't match", async () => {
    const token = signToken({ sub: "user-1", role: "HR_MANAGER" });

    const response = await request(buildTestApp())
      .get("/admin-only")
      .set("Cookie", [`${env.COOKIE_NAME}=${token}`]);

    expect(response.status).toBe(403);
  });

  it("allows a role-restricted route when the role matches", async () => {
    const token = signToken({ sub: "user-1", role: "ADMIN" });

    const response = await request(buildTestApp())
      .get("/admin-only")
      .set("Cookie", [`${env.COOKIE_NAME}=${token}`]);

    expect(response.status).toBe(200);
  });
});
