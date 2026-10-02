import { prisma } from "../../lib/prisma.ts";

export function listDepartments() {
  return prisma.department.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
