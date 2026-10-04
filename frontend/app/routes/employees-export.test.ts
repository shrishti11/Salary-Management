import { afterEach, describe, expect, it, vi } from "vitest";

import { loader } from "./employees-export";

const call = (url: string) => loader({ request: new Request(url), params: {}, context: {} } as Parameters<typeof loader>[0]);

afterEach(() => vi.unstubAllGlobals());

describe("employees export route", () => {
  it("forwards only the list filters, drops paging and unknown params, and relays the CSV download", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("a,b\r\n", { headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="employees-2026-10-04.csv"' } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = (await call("http://x/employees/export?status=ALL&q=asha&page=3&pageSize=50&add=1&evil=1")) as Response;
    const calledUrl = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(calledUrl.pathname).toBe("/api/salaries/export");
    expect(Object.fromEntries(calledUrl.searchParams)).toEqual({ status: "ALL", q: "asha" });
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="employees-2026-10-04.csv"');
    expect(await response.text()).toBe("a,b\r\n");
  });

  it("redirects to /login on 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    await expect(call("http://x/employees/export")).rejects.toMatchObject({ status: 302 });
  });

  it("throws the backend status on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    await expect(call("http://x/employees/export")).rejects.toMatchObject({ status: 500 });
  });
});
