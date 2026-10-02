import { afterEach, describe, expect, it, vi } from "vitest";

import { loader } from "./authenticated";

const args = () =>
  ({
    request: new Request("http://localhost:3000/dashboard"),
    params: {},
    context: {},
  }) as Parameters<typeof loader>[0];

describe("authenticated layout loader", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redirects to /login when unauthenticated", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    const thrown = await loader(args()).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(302);
    expect((thrown as Response).headers.get("Location")).toBe("/login");
  });

  it("returns the user when authenticated", async () => {
    const user = { id: "1", email: "a@b.com", name: "A", role: "ADMIN" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ user }), { status: 200 })));

    expect(await loader(args())).toEqual({ user });
  });
});
