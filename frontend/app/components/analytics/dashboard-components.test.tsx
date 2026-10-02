import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MemoryRouter } from "react-router";

import MoneyList from "./MoneyList";
import RecentActivity from "./RecentActivity";

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

describe("RecentActivity", () => {
  it("shows negative changes and new currencies", () => {
    const rev = (id: string, changePercent: string | null) => ({
      id,
      employee: { id: "e1", employeeCode: "EMP-0001", name: "Asha Rao" },
      currency: "USD",
      effectiveDate: "2026-10-01",
      gross: "1000.00",
      changePercent,
      reason: "r",
      createdBy: { id: "u1", name: "Hannah HR" },
      createdAt: "2026-10-02T11:00:00.000Z",
    });
    render(
      <MemoryRouter>
        <RecentActivity recentEmployees={[]} recentRevisions={[rev("a", "-5.00"), rev("b", null)]} />
      </MemoryRouter>,
    );
    expect(screen.getByText("-5.00%")).toBeInTheDocument();
    expect(screen.getByText("new currency")).toBeInTheDocument();
  });
});
