import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.ts";
import { loginHandler, logoutHandler, meHandler } from "./auth.controller.ts";

export const authRouter = Router();

authRouter.post("/login", loginHandler);
authRouter.post("/logout", logoutHandler);
authRouter.get("/me", requireAuth, meHandler);
