import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.ts";
import { summaryHandler } from "./analytics.controller.ts";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth, requireRole("ADMIN", "HR_MANAGER"));

analyticsRouter.get("/summary", summaryHandler);
