import { randomUUID } from "node:crypto";

import request from "supertest";

import { app } from "../app";
import { env } from "../config/env";
import { signToken } from "../lib/jwt";
import { hashPassword } from "../lib/password";
import { prisma } from "../lib/prisma";

export const TEST_PASSWORD = "correct-horse-battery-staple";

export async function createTestUser(email: string, role: "ADMIN" | "HR_MANAGER" = "HR_MANAGER") {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  return prisma.user.create({ data: { email, passwordHash, name: "Test User", role } });
}

export async function loginAs(email: string) {
  const agent = request.agent(app);
  const response = await agent.post("/api/auth/login").send({ email, password: TEST_PASSWORD });
  if (response.status !== 200) throw new Error(`Test login failed: ${response.status}`);
  return agent;
}

/** A validly signed session cookie for a role the DB enum does not contain (requireAuth is stateless). */
export function forgedCookie(role: string): string {
  return `${env.COOKIE_NAME}=${signToken({ sub: randomUUID(), role })}`;
}
