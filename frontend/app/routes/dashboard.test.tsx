import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import Dashboard from "./dashboard";

describe("Dashboard route", () => {
  it("shows the signed-in user from the parent loader", async () => {
    const router = createMemoryRouter([
      {
        id: "routes/authenticated",
        path: "/",
        loader: () => ({ user: { id: "1", email: "a@b.com", name: "Alice", role: "ADMIN" } }),
        children: [{ index: true, Component: Dashboard }],
      },
    ]);

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("Signed in as Alice (ADMIN).")).toBeInTheDocument();
  });
});
