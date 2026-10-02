import { redirect } from "react-router";

import { apiFetch } from "~/lib/api-client";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

/** Resolves the current user from the backend, or throws a redirect to /login. */
export async function requireUser(request: Request): Promise<AuthUser> {
  const cookie = request.headers.get("cookie");

  const response = await apiFetch("/api/auth/me", {
    headers: cookie ? { cookie } : {},
  });

  if (!response.ok) {
    throw redirect("/login");
  }

  const { user } = (await response.json()) as { user: AuthUser };
  return user;
}
