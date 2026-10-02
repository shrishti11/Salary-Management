import { describe, expect, it, beforeEach, afterEach } from "vitest";

const REQUIRED_ENV = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/salary_management?schema=public",
  JWT_SECRET: "a".repeat(32),
};

describe("env config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("applies defaults when optional vars are missing", async () => {
    process.env.DATABASE_URL = REQUIRED_ENV.DATABASE_URL;
    process.env.JWT_SECRET = REQUIRED_ENV.JWT_SECRET;
    delete process.env.PORT;
    delete process.env.JWT_EXPIRES_IN;
    delete process.env.COOKIE_NAME;
    delete process.env.FRONTEND_URL;
    delete process.env.NODE_ENV;

    const { loadEnv } = await import("./env");
    const env = loadEnv();

    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe("development");
    expect(env.JWT_EXPIRES_IN).toBe("1d");
    expect(env.COOKIE_NAME).toBe("session");
    expect(env.FRONTEND_URL).toBe("http://localhost:3000");
  });

  it("throws when JWT_SECRET is missing", async () => {
    process.env.DATABASE_URL = REQUIRED_ENV.DATABASE_URL;
    delete process.env.JWT_SECRET;

    const { loadEnv } = await import("./env");

    expect(() => loadEnv()).toThrow();
  });

  it("throws when JWT_SECRET is too short", async () => {
    process.env.DATABASE_URL = REQUIRED_ENV.DATABASE_URL;
    process.env.JWT_SECRET = "short";

    const { loadEnv } = await import("./env");

    expect(() => loadEnv()).toThrow();
  });
});
