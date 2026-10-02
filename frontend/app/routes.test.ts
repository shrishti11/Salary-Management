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
});
