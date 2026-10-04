// Seeds the 10,000-employee demo company (same code as the dashboard button). `--reset` replaces the existing demo set.
import { prisma } from "../src/lib/prisma.ts";
import { seedDemoData } from "../src/modules/demo-data/demo-data.service.ts";

const admin = await prisma.user.findFirst({ where: { role: "ADMIN", isActive: true }, orderBy: { createdAt: "asc" } });
if (!admin) {
  console.error("No admin user found. Run `bun run db:seed` first.");
  process.exit(1);
}

const reset = process.argv.includes("--reset");
const result = await seedDemoData(admin.id, { reset });
console.log(
  result.created
    ? `Seeded demo data: ${result.count} employees in ${(result.durationMs / 1000).toFixed(1)}s`
    : `Demo data already present (${result.count} employees); nothing to do`,
);
await prisma.$disconnect();
