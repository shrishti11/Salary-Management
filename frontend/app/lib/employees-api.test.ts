import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_LIST_PARAMS,
  createEmployee,
  getEmployee,
  listEmployees,
  parseListParams,
  setEmployeeStatus,
  toFormError,
  toSearchParams,
} from "./employees-api";

const req = () => new Request("http://localhost:3000/employees", { headers: { cookie: "session=abc" } });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("parseListParams", () => {
  it("returns defaults for an empty query", () => {
    expect(parseListParams(new URLSearchParams())).toEqual(DEFAULT_LIST_PARAMS);
  });

  it("parses valid values", () => {
    const params = parseListParams(
      new URLSearchParams("page=3&pageSize=50&q=%20asha%20&country=IN&status=INACTIVE&sortBy=name&sortOrder=desc"),
    );
    expect(params).toMatchObject({ page: 3, pageSize: 50, q: "asha", country: "IN", status: "INACTIVE", sortBy: "name", sortOrder: "desc" });
  });

  it("falls back to defaults for tampered values", () => {
    const params = parseListParams(
      new URLSearchParams("page=-4&pageSize=9999&country=ZZ&status=FIRED&sortBy=passwordHash&sortOrder=up&departmentId=nope"),
    );
    expect(params).toEqual(DEFAULT_LIST_PARAMS);
    expect(parseListParams(new URLSearchParams("page=abc")).page).toBe(1);
  });
});

describe("toSearchParams", () => {
  it("omits empty values and defaults", () => {
    expect(toSearchParams(DEFAULT_LIST_PARAMS).toString()).toBe("");
    expect(toSearchParams({ ...DEFAULT_LIST_PARAMS, q: "asha", page: 2, sortBy: "name" }).toString()).toBe(
      "page=2&q=asha&sortBy=name",
    );
  });
});

describe("api calls", () => {
  it("lists employees with the query string and forwarded cookie", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listEmployees(req(), { ...DEFAULT_LIST_PARAMS, q: "asha" });

    expect(result.ok).toBe(true);
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/\/api\/employees\?q=asha$/);
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
    ["DUPLICATE_EMPLOYEE_CODE", "employeeCode"],
    ["DUPLICATE_EMAIL", "email"],
    ["INVALID_DEPARTMENT", "departmentId"],
  ])("maps %s to the %s field", (code, field) => {
    expect(toFormError({ ok: false, status: 409, code, message: "m" })).toEqual({ message: "m", field });
  });

  it("leaves other errors without a field", () => {
    expect(toFormError({ ok: false, status: 500, message: "m" })).toEqual({ message: "m" });
  });
});
