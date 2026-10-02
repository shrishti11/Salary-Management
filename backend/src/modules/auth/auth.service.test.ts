import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import { login } from "./auth.service";

const TEST_EMAIL = "foundation-test-user@example.com";
const TEST_PASSWORD = "correct-horse-battery-staple";

describe("auth.service login", () => {
  beforeAll(async () => {
    const passwordHash = await hashPassword(TEST_PASSWORD);
    await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        passwordHash,
        name: "Foundation Test User",
        role: "HR_MANAGER",
      },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { email: TEST_EMAIL } });
    await prisma.$disconnect();
  });

  it("returns a token and user for correct credentials", async () => {
    const result = await login(TEST_EMAIL, TEST_PASSWORD);

    expect(result.token).toEqual(expect.any(String));
    expect(result.user).toEqual({
      id: expect.any(String),
      email: TEST_EMAIL,
      name: "Foundation Test User",
      role: "HR_MANAGER",
    });
  });

  it("rejects an unknown email", async () => {
    await expect(login("nobody@example.com", TEST_PASSWORD)).rejects.toThrow("Invalid credentials");
  });

  it("rejects an incorrect password", async () => {
    await expect(login(TEST_EMAIL, "wrong-password")).rejects.toThrow("Invalid credentials");
  });

  it("rejects an inactive user", async () => {
    await prisma.user.update({ where: { email: TEST_EMAIL }, data: { isActive: false } });

    await expect(login(TEST_EMAIL, TEST_PASSWORD)).rejects.toThrow("Invalid credentials");

    await prisma.user.update({ where: { email: TEST_EMAIL }, data: { isActive: true } });
  });
});
