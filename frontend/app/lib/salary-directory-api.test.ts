import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SALARY_LIST_PARAMS,
  listSalaryDirectory,
  parseSalaryListParams,
  toSalarySearchParams,
} from "./salary-directory-api";

const req = () => new Request("http://localhost:3000/salaries", { headers: { cookie: "session=abc" } });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("parseSalaryListParams", () => {
  it("returns defaults for an empty query", () => {
    expect(parseSalaryListParams(new URLSearchParams())).toEqual(DEFAULT_SALARY_LIST_PARAMS);
    expect(DEFAULT_SALARY_LIST_PARAMS).toMatchObject({ status: "ACTIVE", salary: "", sortBy: "name", sortOrder: "asc" });
  });

  it("parses valid values", () => {
    expect(
      parseSalaryListParams(
        new URLSearchParams("page=3&pageSize=50&q=%20asha%20&country=IN&status=ALL&salary=without&sortBy=effectiveDate&sortOrder=desc"),
      ),
    ).toMatchObject({ page: 3, pageSize: 50, q: "asha", country: "IN", status: "ALL", salary: "without", sortBy: "effectiveDate", sortOrder: "desc" });
  });

  it("falls back to defaults for tampered values", () => {
    const params = parseSalaryListParams(
      new URLSearchParams("page=-4&pageSize=9999&country=ZZ&status=FIRED&salary=maybe&sortBy=gross&sortOrder=up&departmentId=nope"),
    );
    expect(params).toEqual(DEFAULT_SALARY_LIST_PARAMS);
    expect(parseSalaryListParams(new URLSearchParams("page=abc")).page).toBe(1);
  });

  it("rejects sort fields that belong to the employee list only", () => {
    expect(parseSalaryListParams(new URLSearchParams("sortBy=designation")).sortBy).toBe("name");
  });
});

describe("toSalarySearchParams", () => {
  it("omits empty values and defaults", () => {
    expect(toSalarySearchParams(DEFAULT_SALARY_LIST_PARAMS).toString()).toBe("");
    expect(
      toSalarySearchParams({ ...DEFAULT_SALARY_LIST_PARAMS, q: "asha", page: 2, status: "ALL", salary: "with" }).toString(),
    ).toBe("page=2&q=asha&status=ALL&salary=with");
  });

  it("keeps ACTIVE out of the URL but serialises INACTIVE", () => {
    expect(toSalarySearchParams({ status: "ACTIVE" }).toString()).toBe("");
    expect(toSalarySearchParams({ status: "INACTIVE" }).toString()).toBe("status=INACTIVE");
  });
});

describe("listSalaryDirectory", () => {
  it("builds the query and forwards the cookie", async () => {
    const fetchMock = vi.fn(async () => json({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listSalaryDirectory(req(), { ...DEFAULT_SALARY_LIST_PARAMS, q: "asha", salary: "with" });

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe("/api/salaries");
    expect(new URL(url).search).toBe("?q=asha&salary=with");
    expect(new Headers(init.headers).get("cookie")).toBe("session=abc");
  });

  it("calls the bare endpoint for defaults", async () => {
    const fetchMock = vi.fn(async () => json({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }));
    vi.stubGlobal("fetch", fetchMock);
    await listSalaryDirectory(req(), DEFAULT_SALARY_LIST_PARAMS);
    expect(new URL((fetchMock.mock.calls[0] as unknown as [string])[0]).search).toBe("");
  });

  it("redirects to /login on 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "no" } }, 401)));
    const thrown = await listSalaryDirectory(req(), DEFAULT_SALARY_LIST_PARAMS).catch((e) => e);
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get("Location")).toBe("/login");
  });

  it("returns a failure result for other errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "boom" } }, 500)));
    expect(await listSalaryDirectory(req(), DEFAULT_SALARY_LIST_PARAMS)).toMatchObject({ ok: false, status: 500, message: "boom" });
  });

  it("accepts joiningDate as a sort field", () => {
    const params = parseSalaryListParams(new URLSearchParams("sortBy=joiningDate&sortOrder=desc"));
    expect(params.sortBy).toBe("joiningDate");
    expect(toSalarySearchParams(params).get("sortBy")).toBe("joiningDate");
  });
});
