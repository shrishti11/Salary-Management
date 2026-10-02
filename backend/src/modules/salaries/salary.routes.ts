import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.ts";
import { createSalaryHandler, getSalaryHandler, listSalariesHandler } from "./salary.controller.ts";

export const salaryRouter = Router({ mergeParams: true });

salaryRouter.use(requireAuth, requireRole("ADMIN", "HR_MANAGER"));

salaryRouter.get("/", listSalariesHandler);
salaryRouter.post("/", createSalaryHandler);
salaryRouter.get("/:salaryId", getSalaryHandler);
