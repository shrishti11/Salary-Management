import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Money from "./Money";

describe("Money", () => {
  it("formats the amount", () => {
    render(<Money amount="1234.5" currency="USD" />);
    expect(screen.getByText("$1,234.50")).toBeInTheDocument();
  });
});
