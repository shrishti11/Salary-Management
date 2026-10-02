import { afterEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "./api-client";

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefixes the path with the API base URL and includes credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/auth/me");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/auth/me",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("forwards a cookie header when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/auth/me", { headers: { cookie: "session=abc" } });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.cookie).toBe("session=abc");
  });
});
