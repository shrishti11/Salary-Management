import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import AppLayout from "./AppLayout";

describe("AppLayout", () => {
  it("renders the app title and navigation links", () => {
    const router = createMemoryRouter([
      {
        path: "/",
        Component: AppLayout,
        children: [{ index: true, Component: () => <div>child content</div> }],
      },
    ]);

    render(<RouterProvider router={router} />);

    expect(screen.getByText("Salary Management")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Employees" })).toBeInTheDocument();
    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it("shows the user and a logout button when a user is provided", () => {
    const router = createMemoryRouter([
      {
        path: "/",
        Component: () => <AppLayout user={{ name: "Alice", role: "ADMIN" }} />,
        children: [{ index: true, Component: () => <div>child content</div> }],
      },
    ]);

    render(<RouterProvider router={router} />);

    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Logout" })).toHaveAttribute("type", "submit");
  });
});
