import { existsSync } from "node:fs";

import { defineConfig } from "prisma/config";

// Prisma 7 does not auto-load .env; load it for CLI commands (migrate, generate).
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
