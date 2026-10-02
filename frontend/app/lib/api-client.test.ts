import { afterEach, describe, expect, it, vi } from "vitest";

import { apiFetch, apiFetchAs } from "./api-client";

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

describe("apiFetchAs", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("forwards the incoming cookie header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetchAs(new Request("http://localhost:3000/x", { headers: { cookie: "session=abc" } }), "/api/employees");

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).cookie).toBe("session=abc");
  });

  it("sends no cookie header when the request has none", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetchAs(new Request("http://localhost:3000/x"), "/api/employees");

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).cookie).toBeUndefined();
  });
});
