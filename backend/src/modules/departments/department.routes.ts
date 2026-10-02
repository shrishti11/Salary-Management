import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.ts";
import { listDepartmentsHandler } from "./department.controller.ts";

export const departmentRouter = Router();

departmentRouter.use(requireAuth, requireRole("ADMIN", "HR_MANAGER"));
departmentRouter.get("/", listDepartmentsHandler);
