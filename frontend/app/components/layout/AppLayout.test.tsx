import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import userEvent from "@testing-library/user-event";
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

  it("shows the user and a logout button in the user menu when a user is provided", async () => {
    const router = createMemoryRouter([
      {
        path: "/",
        Component: () => <AppLayout user={{ name: "Alice", role: "ADMIN" }} />,
        children: [{ index: true, Component: () => <div>child content</div> }],
      },
    ]);

    render(<RouterProvider router={router} />);

    await userEvent.click(screen.getByRole("button", { name: /Alice/ }));
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

  it("shows exactly Dashboard, Employees, Analytics in order", () => {
    const router = createMemoryRouter([{ path: "/", Component: AppLayout, children: [{ index: true, Component: () => <div /> }] }]);
    render(<RouterProvider router={router} />);
    expect(screen.getAllByRole("link").map((l) => l.textContent)).toEqual(["Dashboard", "Employees", "Analytics"]);
  });

  it("highlights Analytics on /analytics", () => {
    const router = createMemoryRouter(
      [{ path: "/", Component: AppLayout, children: [{ path: "analytics", Component: () => <div>a</div> }] }],
      { initialEntries: ["/analytics?basis=net"] },
    );
    render(<RouterProvider router={router} />);
    expect(screen.getByRole("link", { name: "Analytics" })).toHaveClass("Mui-selected");
  });
});
