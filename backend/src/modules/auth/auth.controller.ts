import type { Request, Response } from "express";

import { env } from "../../config/env.ts";
import { AppError } from "../../middleware/error.middleware.ts";
import { prisma } from "../../lib/prisma.ts";
import { loginSchema } from "./auth.schema.ts";
import { login } from "./auth.service.ts";

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
};

export async function loginHandler(request: Request, response: Response) {
  const { email, password } = loginSchema.parse(request.body);
  const { token, user } = await login(email, password);

  response.cookie(env.COOKIE_NAME, token, COOKIE_OPTIONS);
  response.status(200).json({ user });
}

export function logoutHandler(_request: Request, response: Response) {
  response.clearCookie(env.COOKIE_NAME, COOKIE_OPTIONS);
  response.status(200).json({ message: "Logged out" });
}

export async function meHandler(request: Request, response: Response) {
  const user = await prisma.user.findUnique({ where: { id: request.user!.id } });

  if (!user || !user.isActive) {
    response.clearCookie(env.COOKIE_NAME, COOKIE_OPTIONS);
    throw new AppError(401, "Unauthorized");
  }

  response.status(200).json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}
