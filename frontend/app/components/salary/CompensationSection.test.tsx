import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { SalaryOverview } from "~/lib/salaries-api";

import CompensationSection from "./CompensationSection";
import { makeSalary } from "./fixtures";

const scheduled = makeSalary({
  id: "s3",
  effectiveDate: "2027-01-01",
  status: "SCHEDULED",
  currency: "INR",
  totals: { gross: "6000.00", deductions: "0.00", net: "6000.00" },
  changeFromPrevious: { gross: "500.00", net: "1200.00", grossPercent: "9.09" },
  reason: "Promotion",
});
const previous = makeSalary({
  id: "s0",
  effectiveDate: "2025-01-01",
  status: "PREVIOUS",
  reason: "Joined",
  totals: { gross: "5200.00", deductions: "800.00", net: "4400.00" },
  changeFromPrevious: null,
});
const current = makeSalary({
  changeFromPrevious: { gross: "300.00", net: "400.00", grossPercent: "5.77" },
});
const dropped = makeSalary({
  id: "s-1",
  effectiveDate: "2024-01-01",
  status: "PREVIOUS",
  reason: "Cut",
  changeFromPrevious: {
    gross: "-100.00",
    net: "-100.00",
    grossPercent: "-2.00",
  },
});

const populated: SalaryOverview = {
  current,
  scheduled,
  history: [scheduled, current, previous, dropped],
};

function renderSection(
  result: Parameters<typeof CompensationSection>[0]["result"],
  props: Partial<Parameters<typeof CompensationSection>[0]> = {},
) {
  return render(<CompensationSection result={result} employeeActive {...props} />);
}

const empty = { current: null, scheduled: null, history: [] };

describe("CompensationSection", () => {
  it("renders nothing on 403", () => {
    const { container } = renderSection({ ok: false, status: 403, message: "Forbidden" });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an error alert on other failures", () => {
    renderSection({ ok: false, status: 500, message: "boom" });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load compensation.");
  });

  it("empty history: offers a Set salary button wired to the given handler", async () => {
    const onSetSalary = vi.fn();
    renderSection({ ok: true, data: empty }, { onSetSalary });
    expect(screen.getByText("No salary recorded yet.")).toBeInTheDocument();
    expect(screen.getByText("Add the first salary record for this employee.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Set salary" }));
    expect(onSetSalary).toHaveBeenCalledTimes(1);
  });

  it("empty history for an inactive employee shows the inactive note and no salary control", () => {
    renderSection({ ok: true, data: empty }, { employeeActive: false, onSetSalary: vi.fn() });
    expect(screen.getByText("Inactive employees cannot receive salary changes.")).toBeInTheDocument();
    expect(screen.queryByText("Add the first salary record for this employee.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("populated: shows the current card with components and totals, and no buttons", () => {
    renderSection({ ok: true, data: populated });
    expect(screen.getByRole("heading", { name: "Current salary" })).toBeInTheDocument();
    const card = screen.getByTestId("current-salary");
    expect(within(card).getByText("USD · Effective Jan 1, 2026")).toBeInTheDocument();
    expect(within(card).getByText("Annual review")).toBeInTheDocument();
    expect(within(card).getByText("Housing")).toBeInTheDocument();
    expect(within(card).getByText("Tax")).toBeInTheDocument();
    expect(within(card).getByText("$5,500.00")).toBeInTheDocument();
    expect(within(card).getAllByText("$700.00")).toHaveLength(2);
    expect(within(card).getByText("$4,800.00")).toBeInTheDocument();
    expect(within(card).getByText("Net")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the scheduled alert with the record currency", () => {
    renderSection({ ok: true, data: populated });
    expect(screen.getByText(/Scheduled change effective Jan 1, 2027: net ₹6,000\.00/)).toBeInTheDocument();
  });

  it("shows the inactive note for an inactive employee with history", () => {
    renderSection({ ok: true, data: populated }, { employeeActive: false });
    expect(screen.getByText("Inactive employees cannot receive salary changes.")).toBeInTheDocument();
  });

  it("history lists rows newest first with change cells", () => {
    renderSection({ ok: true, data: populated });
    const table = screen.getByRole("table", { name: "Salary history" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent("Jan 1, 2027");
    expect(rows[0]).toHaveTextContent("Scheduled");
    expect(rows[0]).toHaveTextContent("+₹500.00 (9.09%)");
    expect(rows[1]).toHaveTextContent("+$300.00 (5.77%)");
    expect(rows[1]).toHaveTextContent("Hannah HR");
    expect(rows[2]).toHaveTextContent("—");
    expect(rows[3]).toHaveTextContent("-$100.00 (-2.00%)");
    expect(within(rows[2]!).getByText("Previous")).toBeInTheDocument();
  });

  it("orders history newest first even when given out of order", () => {
    renderSection({ ok: true, data: { ...populated, history: [previous, dropped, scheduled, current] } });
    const rows = within(screen.getByRole("table", { name: "Salary history" })).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.querySelector("td")?.textContent)).toEqual([
      "Jan 1, 2027",
      "Jan 1, 2026",
      "Jan 1, 2025",
      "Jan 1, 2024",
    ]);
  });

  it("handles no current salary with scheduled changes", () => {
    renderSection({ ok: true, data: { current: null, scheduled, history: [scheduled] } });
    expect(screen.getByText("No current salary yet. Scheduled changes are listed below.")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Salary history" })).toBeInTheDocument();
  });
});
