import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.ts";
import { exportSalaryDirectoryHandler, listSalaryDirectoryHandler } from "./salary.controller.ts";

export const salaryDirectoryRouter = Router();

salaryDirectoryRouter.use(requireAuth, requireRole("ADMIN", "HR_MANAGER"));

salaryDirectoryRouter.get("/", listSalaryDirectoryHandler);
salaryDirectoryRouter.get("/export", exportSalaryDirectoryHandler);
