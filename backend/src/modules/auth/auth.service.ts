import { AppError } from "../../middleware/error.middleware.ts";
import { verifyPassword } from "../../lib/password.ts";
import { prisma } from "../../lib/prisma.ts";
import { signToken } from "../../lib/jwt.ts";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export async function login(
  email: string,
  password: string,
): Promise<{ token: string; user: AuthenticatedUser }> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.isActive) {
    throw new AppError(401, "Invalid credentials");
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);

  if (!passwordMatches) {
    throw new AppError(401, "Invalid credentials");
  }

  const token = signToken({ sub: user.id, role: user.role });

  return {
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
}
