import { afterEach, describe, expect, it, vi } from "vitest";

import { requireUser } from "./require-user";

const user = { id: "1", email: "a@b.com", name: "A", role: "ADMIN" };

describe("requireUser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws a redirect to /login when the backend returns 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    const thrown = await requireUser(new Request("http://localhost:3000/dashboard")).catch((e) => e);

    expect(thrown).toBeInstanceOf(Response);
    expect(thrown.status).toBe(302);
    expect(thrown.headers.get("Location")).toBe("/login");
  });

  it("returns the user and forwards the cookie header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ user }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requireUser(
      new Request("http://localhost:3000/dashboard", { headers: { cookie: "sid=abc" } }),
    );

    expect(result).toEqual(user);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/auth/me");
    expect(fetchMock.mock.calls[0][1].headers.cookie).toBe("sid=abc");
  });

  it("lets network errors propagate", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));

    await expect(requireUser(new Request("http://localhost:3000/dashboard"))).rejects.toThrow("down");
  });
});
