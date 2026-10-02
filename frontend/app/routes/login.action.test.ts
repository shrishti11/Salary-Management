import { afterEach, describe, expect, it, vi } from "vitest";

import { action } from "./login";

function loginRequest() {
  const body = new URLSearchParams({ email: "a@b.com", password: "pw" });
  return new Request("http://localhost:3000/login", { method: "POST", body });
}

const callAction = () =>
  action({ request: loginRequest(), params: {}, context: {} } as Parameters<typeof action>[0]);

describe("login action", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("relays every Set-Cookie header on a redirect to /dashboard", async () => {
    const backend = new Response(null, { status: 200 });
    backend.headers.append("Set-Cookie", "a=1; Path=/; HttpOnly");
    backend.headers.append("Set-Cookie", "b=2; Path=/");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(backend));

    const result = (await callAction()) as Response;

    expect(result.status).toBe(302);
    expect(result.headers.get("Location")).toBe("/dashboard");
    expect(result.headers.getSetCookie()).toEqual(["a=1; Path=/; HttpOnly", "b=2; Path=/"]);
  });

  it("returns an error when the backend rejects credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    expect(await callAction()).toEqual({ error: "Invalid credentials" });
  });
});
