import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.ts";
import { getDemoDataStatusHandler, seedDemoDataHandler } from "./demo-data.controller.ts";

export const demoDataRouter = Router();

demoDataRouter.use(requireAuth);
demoDataRouter.get("/", requireRole("ADMIN", "HR_MANAGER"), getDemoDataStatusHandler);
demoDataRouter.post("/seed", requireRole("ADMIN"), seedDemoDataHandler);
