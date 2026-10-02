import jwt, { type SignOptions } from "jsonwebtoken";

import { env } from "../config/env.ts";

export interface TokenPayload {
  sub: string;
  role: string;
}

export function signToken(payload: TokenPayload): string {
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as any };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);

  if (typeof decoded === "string" || !("sub" in decoded) || !("role" in decoded)) {
    throw new Error("Invalid token payload");
  }

  return { sub: decoded.sub as string, role: decoded.role as string };
}
