import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { AUTHENTICATED_ROUTE_ID } from "~/lib/route-ids";
import Dashboard from "./dashboard";

describe("Dashboard route", () => {
  it("shows the signed-in user from the parent loader", async () => {
    const router = createMemoryRouter([
      {
        id: AUTHENTICATED_ROUTE_ID,
        path: "/",
        loader: () => ({ user: { id: "1", email: "a@b.com", name: "Alice", role: "ADMIN" } }),
        children: [{ index: true, Component: Dashboard }],
      },
    ]);

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("Signed in as Alice (ADMIN).")).toBeInTheDocument();
  });

  it("fails loudly when the authenticated parent route is missing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const router = createMemoryRouter([{ path: "/", Component: Dashboard }]);

    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole("heading", {
        name: "Dashboard must render inside the authenticated layout route",
      }),
    ).toBeInTheDocument();
    spy.mockRestore();
  });
});
