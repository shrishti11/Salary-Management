import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.ts";
import {
  createEmployeeHandler,
  getEmployeeHandler,
  setEmployeeStatusHandler,
  updateEmployeeHandler,
} from "./employee.controller.ts";

export const employeeRouter = Router();

employeeRouter.use(requireAuth, requireRole("ADMIN", "HR_MANAGER"));

employeeRouter.post("/", createEmployeeHandler);
employeeRouter.get("/:id", getEmployeeHandler);
employeeRouter.patch("/:id", updateEmployeeHandler);
employeeRouter.patch("/:id/status", setEmployeeStatusHandler);
