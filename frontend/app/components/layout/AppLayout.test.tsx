import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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

  function renderWithUser() {
    const logoutAction = vi.fn(() => null);
    const router = createMemoryRouter([
      {
        path: "/",
        Component: () => <AppLayout user={{ name: "Alice", role: "ADMIN" }} />,
        children: [{ index: true, Component: () => <div>child content</div> }],
      },
      { path: "/logout", action: logoutAction, Component: () => <div>logged out</div> },
    ]);
    render(<RouterProvider router={router} />);
    return { logoutAction, router };
  }

  it("exposes the user menu button as a menu trigger", async () => {
    renderWithUser();
    const trigger = screen.getByRole("button", { name: /Alice/ });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu");
    expect(trigger).toHaveAttribute("aria-controls", menu.id);
  });

  it("logs out with a POST to /logout when the Logout menu item is clicked", async () => {
    const { logoutAction } = renderWithUser();
    await userEvent.click(screen.getByRole("button", { name: /Alice/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Logout" }));
    await waitFor(() => expect(logoutAction).toHaveBeenCalledTimes(1));
    const [{ request }] = logoutAction.mock.calls[0] as unknown as [{ request: Request }];
    expect(request.method).toBe("POST");
    expect(new URL(request.url).pathname).toBe("/logout");
  });

  it("logs out when the Logout menu item is activated with the keyboard", async () => {
    const { logoutAction } = renderWithUser();
    await userEvent.click(screen.getByRole("button", { name: /Alice/ }));
    const item = screen.getByRole("menuitem", { name: "Logout" });
    await waitFor(() => expect(item).toHaveFocus());
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(logoutAction).toHaveBeenCalledTimes(1));
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
