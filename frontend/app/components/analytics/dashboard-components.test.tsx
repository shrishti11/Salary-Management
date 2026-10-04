import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MemoryRouter } from "react-router";

import RecentActivity from "./RecentActivity";

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
