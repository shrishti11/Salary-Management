import type { NextFunction, Request, Response } from "express";
import { parseCookie } from "cookie";

import { env } from "../config/env.ts";
import { verifyToken } from "../lib/jwt.ts";
import { AppError } from "./error.middleware.ts";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: string };
    }
  }
}

export function requireAuth(request: Request, _response: Response, next: NextFunction) {
  const cookies = parseCookie(request.headers.cookie ?? "");
  const token = cookies[env.COOKIE_NAME];

  if (!token) {
    next(new AppError(401, "Unauthorized"));
    return;
  }

  try {
    const payload = verifyToken(token);
    request.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new AppError(401, "Unauthorized"));
  }
}

export function requireRole(...roles: string[]) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!request.user || !roles.includes(request.user.role)) {
      next(new AppError(403, "Forbidden"));
      return;
    }
    next();
  };
}
