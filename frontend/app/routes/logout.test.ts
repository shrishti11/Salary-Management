import { afterEach, describe, expect, it, vi } from "vitest";

import { action, loader } from "./logout";

describe("logout route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the backend with the cookie and relays Set-Cookie on redirect to /login", async () => {
    const backend = new Response(null, { status: 200 });
    backend.headers.append("Set-Cookie", "sid=; Max-Age=0; Path=/");
    const fetchMock = vi.fn().mockResolvedValue(backend);
    vi.stubGlobal("fetch", fetchMock);

    const result = (await action({
      request: new Request("http://localhost:3000/logout", {
        method: "POST",
        headers: { cookie: "sid=abc" },
      }),
      params: {},
      context: {},
    } as Parameters<typeof action>[0])) as Response;

    expect(fetchMock.mock.calls[0][0]).toContain("/api/auth/logout");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(fetchMock.mock.calls[0][1].headers.cookie).toBe("sid=abc");
    expect(result.status).toBe(302);
    expect(result.headers.get("Location")).toBe("/login");
    expect(result.headers.getSetCookie()).toEqual(["sid=; Max-Age=0; Path=/"]);
  });

  it("redirects GET visits to /dashboard", () => {
    const result = loader();
    expect(result.status).toBe(302);
    expect(result.headers.get("Location")).toBe("/dashboard");
  });
});
