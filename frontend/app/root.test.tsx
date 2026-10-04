import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { ErrorBoundary } from "./root";
import theme from "./theme";

const Boundary = ErrorBoundary as unknown as (props: { error: unknown }) => React.ReactElement;

const renderBoundary = (error: unknown) =>
  render(
    <MemoryRouter>
      <Boundary error={error} />
    </MemoryRouter>,
  );

describe("root ErrorBoundary", () => {
  it("shows a not-found state with a dashboard link for 404", () => {
    renderBoundary({ status: 404, statusText: "Not Found", data: "", internal: true });
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to dashboard" })).toHaveAttribute("href", "/dashboard");
  });

  it("shows a generic state for other errors", () => {
    renderBoundary(new Error("boom"));
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to dashboard" })).toBeInTheDocument();
  });

  it("is themed even without an outer ThemeProvider", () => {
    renderBoundary(new Error("boom"));
    const button = screen.getByRole("link", { name: "Go to dashboard" });
    expect(getComputedStyle(button).getPropertyValue("--variant-containedBg")).toBe(theme.palette.primary.main);
  });
});
