import { describe, expect, it } from "vitest";

import { loader as edit } from "./employee-edit-redirect";
import { loader as newEmp } from "./employee-new-redirect";
import { loader as salaries } from "./salaries-redirect";

const res = (r: unknown) => r as Response;

describe("retired page redirects", () => {
  it("keeps the query string when redirecting /salaries", () => {
    const r = res(salaries({ request: new Request("http://x/salaries?status=ALL&salary=without") } as never));
    expect(r.headers.get("Location")).toBe("/employees?status=ALL&salary=without");
  });

  it("redirects a bare /salaries to /employees", () => {
    const r = res(salaries({ request: new Request("http://x/salaries") } as never));
    expect(r.headers.get("Location")).toBe("/employees");
  });

  it("opens the add dialog", () => {
    expect(res(newEmp()).headers.get("Location")).toBe("/employees?add=1");
  });

  it("opens the edit dialog on the profile", () => {
    expect(res(edit({ params: { id: "e1" } } as never)).headers.get("Location")).toBe("/employees/e1?edit=1");
  });
});
