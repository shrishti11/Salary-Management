import { describe, expect, it } from "vitest";

import { AUTHENTICATED_ROUTE_ID } from "~/lib/route-ids";
import routes from "./routes";

describe("route config", () => {
  it("registers the authenticated layout under the shared route id", async () => {
    const config = await routes;
    const layoutEntry = config.find((r) => r.file === `${AUTHENTICATED_ROUTE_ID}.tsx`);

    expect(layoutEntry).toBeDefined();
    expect(layoutEntry?.children?.some((c) => c.path === "dashboard")).toBe(true);
  });

  it("registers employees, profile, analytics, and redirects for retired pages", async () => {
    const config = await routes;
    const layout = config.find((r) => r.file === `${AUTHENTICATED_ROUTE_ID}.tsx`);
    const paths = layout?.children?.map((c) => c.path);
    expect(paths).toEqual(
      expect.arrayContaining(["dashboard", "employees", "employees/:id", "analytics", "salaries", "employees/new", "employees/:id/edit"]),
    );
    expect(layout?.children?.find((c) => c.path === "salaries")?.file).toBe("routes/salaries-redirect.tsx");
    expect(layout?.children?.find((c) => c.path === "employees/new")?.file).toBe("routes/employee-new-redirect.tsx");
    expect(layout?.children?.find((c) => c.path === "employees/:id/edit")?.file).toBe("routes/employee-edit-redirect.tsx");
  });

  it("registers analytics under the authenticated layout", async () => {
    const config = await routes;
    const layoutEntry = config.find((r) => r.file === `${AUTHENTICATED_ROUTE_ID}.tsx`);

    expect(layoutEntry?.children?.some((c) => c.path === "analytics" && c.file === "routes/analytics.tsx")).toBe(true);
  });
});
