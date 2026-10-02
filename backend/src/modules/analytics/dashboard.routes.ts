import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.ts";
import { dashboardHandler } from "./analytics.controller.ts";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth, requireRole("ADMIN", "HR_MANAGER"));
dashboardRouter.get("/", dashboardHandler);
