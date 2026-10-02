import { existsSync } from "node:fs";

import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../generated/prisma/client.ts";

// tsx does not load .env on its own.
if (existsSync(".env")) process.loadEnvFile(".env");

const DEV_ADMIN_EMAIL = "admin@salary-management.local";
const DEV_ADMIN_PASSWORD = "ChangeMe123!";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const passwordHash = await bcrypt.hash(DEV_ADMIN_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: DEV_ADMIN_EMAIL },
    update: {},
    create: {
      email: DEV_ADMIN_EMAIL,
      passwordHash,
      name: "Dev Admin",
      role: "ADMIN",
    },
  });

  console.log(`Seeded admin user: ${user.email} (password: ${DEV_ADMIN_PASSWORD})`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
