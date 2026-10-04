import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmployee, getEmployee, listDepartments, setEmployeeStatus, toFormError } from "./employees-api";

const req = () => new Request("http://localhost:3000/employees", { headers: { cookie: "session=abc" } });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("api calls", () => {
  it("forwards the session cookie to the backend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ departments: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listDepartments(req());

    expect(result.ok).toBe(true);
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/\/api\/departments$/);
    expect(((fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>).cookie).toBe("session=abc");
  });

  it("throws a redirect to /login on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { message: "Unauthorized" } }, 401)));

    const thrown = await getEmployee(req(), "1").catch((e) => e);

    expect(thrown).toBeInstanceOf(Response);
    expect(thrown.status).toBe(302);
    expect(thrown.headers.get("Location")).toBe("/login");
  });

  it("returns a failure result with code and message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ error: { message: "Email already in use", code: "DUPLICATE_EMAIL" } }, 409)),
    );

    const result = await createEmployee(req(), {} as never);

    expect(result).toEqual({ ok: false, status: 409, code: "DUPLICATE_EMAIL", message: "Email already in use" });
  });

  it("survives a non-JSON error body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));

    expect(await setEmployeeStatus(req(), "1", "INACTIVE")).toEqual({
      ok: false,
      status: 500,
      code: undefined,
      message: "Request failed",
    });
  });
});

describe("toFormError", () => {
  it.each([
    ["DUPLICATE_EMAIL", "email"],
    ["INVALID_DEPARTMENT", "departmentId"],
  ])("maps %s to the %s field", (code, field) => {
    expect(toFormError({ ok: false, status: 409, code, message: "m" })).toEqual({ message: "m", field });
  });

  it("leaves other errors without a field", () => {
    expect(toFormError({ ok: false, status: 500, message: "m" })).toEqual({ message: "m" });
  });
});
