import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ChartCard from "./ChartCard";
import MetricCard from "./MetricCard";
import DistributionChart from "./DistributionChart";

describe("MetricCard", () => {
  it("shows label, value and hint", () => {
    render(<MetricCard label="Active employees" value="7" hint="of 8 total" />);
    expect(screen.getByText("Active employees")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("of 8 total")).toBeInTheDocument();
  });
});

describe("ChartCard", () => {
  it("renders children when ok and not empty", () => {
    render(<ChartCard title="T" result={{ ok: true, data: 1 }}><p>content</p></ChartCard>);
    expect(screen.getByText("content")).toBeInTheDocument();
  });
  it("shows an inline error for a failed result without rendering children", () => {
    render(<ChartCard title="T" result={{ ok: false, status: 500, message: "boom" }}><p>content</p></ChartCard>);
    expect(screen.getByRole("alert")).toHaveTextContent(/could not load/i);
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });
  it("shows the empty message when empty", () => {
    render(<ChartCard title="T" empty="No salary data for these filters"><p>content</p></ChartCard>);
    expect(screen.getByText("No salary data for these filters")).toBeInTheDocument();
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });
});

describe("DistributionChart", () => {
  it("exposes an accessible label and a data table with the buckets", () => {
    render(<DistributionChart currency="USD" buckets={[{ from: "1300.00", to: "1609.99", count: 1 }, { from: "1610.00", to: "1919.99", count: 0 }]} />);
    expect(screen.getByRole("img", { name: /salary distribution in USD/i })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText(/1,300\.00/)).toBeInTheDocument();
  });
});
