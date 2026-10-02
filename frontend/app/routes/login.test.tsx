import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import Login from "./login";

function renderLogin(actionData?: { error: string }) {
  const router = createMemoryRouter([
    { path: "/", Component: () => <Login actionData={actionData} /> },
  ]);
  return render(<RouterProvider router={router} />);
}

describe("Login route component", () => {
  it("shows validation errors for empty submission", async () => {
    const user = userEvent.setup();
    renderLogin(undefined);

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(await screen.findByText("Password is required")).toBeInTheDocument();
  });

  it("shows a server-provided error", () => {
    renderLogin({ error: "Invalid credentials" });

    expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
  });
});
