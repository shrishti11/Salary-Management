import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import MoneyList from "./MoneyList";

describe("MoneyList", () => {
  it("renders one line per currency with the employee count", () => {
    render(
      <MoneyList
        lines={[
          { currency: "USD", count: 3, total: "6800.00", average: "2266.67" },
          { currency: "INR", count: 1, total: "120000.00", average: "120000.00" },
        ]}
      />,
    );
    expect(screen.getByText("USD")).toBeInTheDocument();
    expect(screen.getByText("INR")).toBeInTheDocument();
    expect(screen.getByText(/\$6,800\.00/)).toBeInTheDocument();
    expect(screen.getByText(/\(3\)/)).toBeInTheDocument();
    expect(screen.getByText(/\(1\)/)).toBeInTheDocument();
  });

  it("shows the empty text when there are no lines", () => {
    render(<MoneyList lines={[]} empty="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });
});
