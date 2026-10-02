import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.ts";
import { distributionHandler, filterOptionsHandler, groupsHandler, summaryHandler } from "./analytics.controller.ts";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth, requireRole("ADMIN", "HR_MANAGER"));

analyticsRouter.get("/summary", summaryHandler);
analyticsRouter.get("/distribution", distributionHandler);
analyticsRouter.get("/groups", groupsHandler);
analyticsRouter.get("/filters", filterOptionsHandler);
