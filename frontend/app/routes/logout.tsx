import { redirect } from "react-router";

import { apiFetch } from "~/lib/api-client";
import type { Route } from "./+types/logout";

export async function action({ request }: Route.ActionArgs) {
  const cookie = request.headers.get("cookie");

  const response = await apiFetch("/api/auth/logout", {
    method: "POST",
    headers: cookie ? { cookie } : {},
  });

  // Relay every backend Set-Cookie header so the browser clears the session.
  const headers = new Headers();
  for (const setCookie of response.headers.getSetCookie()) {
    headers.append("Set-Cookie", setCookie);
  }

  return redirect("/login", { headers });
}

export function loader() {
  return redirect("/dashboard");
}
