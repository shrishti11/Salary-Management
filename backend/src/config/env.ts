import { existsSync } from "node:fs";

import { z } from "zod";

// vitest and tsx do not load .env on their own.
if (existsSync(".env")) process.loadEnvFile(".env");

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("1d"),
  COOKIE_NAME: z.string().default("session"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
});

export type Env = z.infer<typeof environmentSchema>;

export function loadEnv(): Env {
  return environmentSchema.parse(process.env);
}

export const env = loadEnv();
