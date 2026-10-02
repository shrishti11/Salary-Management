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

  it("highlights the nav section for the current path", () => {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          Component: AppLayout,
          children: [{ path: "employees/:id", Component: () => <div>profile</div> }],
        },
      ],
      { initialEntries: ["/employees/e1"] },
    );

    render(<RouterProvider router={router} />);

    expect(screen.getByRole("link", { name: "Employees" })).toHaveClass("Mui-selected");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveClass("Mui-selected");
  });

  it("highlights Salaries (and only Salaries) on the salary directory", () => {
    const router = createMemoryRouter(
      [{ path: "/", Component: AppLayout, children: [{ path: "salaries", Component: () => <div>directory</div> }] }],
      { initialEntries: ["/salaries?status=ALL"] },
    );

    render(<RouterProvider router={router} />);

    expect(screen.getByRole("link", { name: "Salaries" })).toHaveClass("Mui-selected");
    expect(screen.getByRole("link", { name: "Employees" })).not.toHaveClass("Mui-selected");
  });

  it("links to Analytics after Salaries and highlights it on /analytics", () => {
    const router = createMemoryRouter(
      [{ path: "/", Component: AppLayout, children: [{ path: "analytics", Component: () => <div>analytics</div> }] }],
      { initialEntries: ["/analytics?basis=net"] },
    );

    render(<RouterProvider router={router} />);

    const links = screen.getAllByRole("link").map((l) => l.textContent);
    expect(links.indexOf("Analytics")).toBe(links.indexOf("Salaries") + 1);
    expect(screen.getByRole("link", { name: "Analytics" })).toHaveClass("Mui-selected");
    expect(screen.getByRole("link", { name: "Salaries" })).not.toHaveClass("Mui-selected");
  });
});
