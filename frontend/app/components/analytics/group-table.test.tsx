import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { GroupRow } from "~/lib/analytics-api";
import GroupTable from "./GroupTable";

const groups: GroupRow[] = [
  {
    key: "d1",
    label: "Design",
    headcount: 5,
    withoutSalary: 1,
    currencies: [{ currency: "USD", count: 4, total: "11200.00", average: "2800.00", median: "2750.00", min: "1300.00", max: "4400.00", p25: "2200.00", p75: "3350.00" }],
  },
  {
    key: "d2",
    label: "Legal",
    headcount: 2,
    withoutSalary: 0,
    currencies: [
      { currency: "USD", count: 2, suppressed: true },
      { currency: "INR", count: 1, suppressed: true },
    ],
  },
  { key: "d3", label: "Ops", headcount: 3, withoutSalary: 3, currencies: [{ currency: "INR", count: 3, total: "1.00", average: "1.00", median: "1.00", min: "1.00", max: "1.00", p25: "1.00", p75: "1.00" }] },
];

describe("GroupTable", () => {
  it("shows stats for a full entry, with the currency and basis in the heading", () => {
    render(<GroupTable groups={groups} currency="USD" groupBy="department" basis="net" />);
    expect(screen.getByRole("table", { name: /USD.*net/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Department" })).toBeInTheDocument();
    const row = screen.getByRole("row", { name: /Design/ });
    for (const text of ["$2,800.00", "$2,750.00", "$1,300.00", "$4,400.00", "$11,200.00"]) {
      expect(within(row).getByText(text)).toBeInTheDocument();
    }
    expect(within(row).getAllByRole("cell").map((c) => c.textContent).slice(0, 4)).toEqual(["Design", "5", "1", "4"]);
  });

  it("shows a suppression note without amounts, and a dash when the currency is absent", () => {
    render(<GroupTable groups={groups} currency="USD" groupBy="department" basis="gross" />);
    const legal = screen.getByRole("row", { name: /Legal/ });
    expect(within(legal).getByText("Fewer than 3 salaried employees")).toBeInTheDocument();
    expect(legal).not.toHaveTextContent("$");
    expect(within(screen.getByRole("row", { name: /Ops/ })).getByText("—")).toBeInTheDocument();
  });

  it("renders country names and the matching header", () => {
    render(<GroupTable groups={[{ key: "IN", label: "IN", headcount: 1, withoutSalary: 0, currencies: [] }]} currency="INR" groupBy="country" basis="gross" />);
    expect(screen.getByRole("columnheader", { name: "Country" })).toBeInTheDocument();
    expect(screen.getByText("India")).toBeInTheDocument();
  });
});
