import { afterEach, describe, expect, it, vi } from "vitest";

import { createSalary, getSalaries, toSalaryFormError } from "./salaries-api";

const req = () => new Request("http://localhost:3000/employees/e1", { headers: { cookie: "session=abc" } });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("getSalaries", () => {
  it("fetches with the cookie forwarded", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ current: null, scheduled: null, history: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getSalaries(req(), "e1");
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/api/employees/e1/salaries");
    expect(new Headers(init.headers).get("cookie")).toContain("session=abc");
  });

  it("redirects to /login on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { message: "no" } }, 401)));
    const thrown = await getSalaries(req(), "e1").catch((e) => e);
    expect(thrown).toBeInstanceOf(Response);
    expect(thrown.status).toBe(302);
    expect(thrown.headers.get("location")).toBe("/login");
  });

  it("returns a failure result on 403", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { code: "FORBIDDEN", message: "no" } }, 403)));
    expect(await getSalaries(req(), "e1")).toMatchObject({ ok: false, status: 403 });
  });
});

describe("createSalary", () => {
  it("POSTs the JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ salary: { id: "s1" } }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const payload = {
      currency: "USD",
      effectiveDate: "2024-01-01",
      components: [{ type: "BASE" as const, name: "Base salary", amount: "1000" }],
    };
    const result = await createSalary(req(), "e1", payload);
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/api/employees/e1/salaries");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(payload);
  });
});

describe("toSalaryFormError", () => {
  const fail = (code?: string) => ({ ok: false as const, status: 409, code, message: "msg" });
  it.each([
    ["DUPLICATE_EFFECTIVE_DATE", "effectiveDate"],
    ["EFFECTIVE_DATE_NOT_AFTER_LATEST", "effectiveDate"],
    ["EFFECTIVE_DATE_BEFORE_JOINING", "effectiveDate"],
    ["REASON_REQUIRED", "reason"],
    ["NEGATIVE_NET", "baseAmount"],
  ])("maps %s", (code, field) => {
    expect(toSalaryFormError(fail(code))).toEqual({ message: "msg", field });
  });

  it("leaves unknown codes without a field", () => {
    expect(toSalaryFormError(fail("WAT"))).toEqual({ message: "msg" });
  });
});
