import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { SalaryOverview } from "~/lib/salaries-api";

import CompensationSection from "./CompensationSection";
import { makeSalary } from "./fixtures";

const noop = () => {};

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
  props = {},
) {
  const handlers = { onSetSalary: vi.fn(), onReviseSalary: vi.fn() };
  render(
    <CompensationSection
      result={result}
      employeeActive
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("CompensationSection", () => {
  it("renders nothing on 403", () => {
    const { container } = render(
      <CompensationSection
        result={{ ok: false, status: 403, message: "Forbidden" }}
        employeeActive
        onSetSalary={noop}
        onReviseSalary={noop}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an error alert on other failures", () => {
    renderSection({ ok: false, status: 500, message: "boom" });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load compensation.",
    );
  });

  it("empty history: set salary button calls handler", async () => {
    const handlers = renderSection({
      ok: true,
      data: { current: null, scheduled: null, history: [] },
    });
    expect(screen.getByText("No salary recorded yet.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Set salary" }));
    expect(handlers.onSetSalary).toHaveBeenCalledTimes(1);
  });

  it("empty history for an inactive employee has no button but a note", () => {
    renderSection(
      { ok: true, data: { current: null, scheduled: null, history: [] } },
      { employeeActive: false },
    );
    expect(
      screen.queryByRole("button", { name: "Set salary" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Inactive employees cannot receive salary changes."),
    ).toBeInTheDocument();
  });

  it("populated: shows the current card, components, totals and revise button", async () => {
    const handlers = renderSection({ ok: true, data: populated });
    expect(
      screen.getByRole("heading", { name: "Compensation" }),
    ).toBeInTheDocument();
    const card = screen.getByTestId("current-salary");
    expect(within(card).getByText("Annual review")).toBeInTheDocument();
    expect(within(card).getByText("Housing")).toBeInTheDocument();
    expect(within(card).getByText("Tax")).toBeInTheDocument();
    expect(within(card).getByText("$5,500.00")).toBeInTheDocument();
    expect(within(card).getAllByText("$700.00")).toHaveLength(2);
    expect(within(card).getByText("$4,800.00")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Revise salary" }),
    );
    expect(handlers.onReviseSalary).toHaveBeenCalledTimes(1);
  });

  it("shows the scheduled alert with the record currency", () => {
    renderSection({ ok: true, data: populated });
    expect(
      screen.getByText(/Scheduled change effective 2027-01-01: net ₹6,000\.00/),
    ).toBeInTheDocument();
  });

  it("hides revise for inactive employees", () => {
    renderSection({ ok: true, data: populated }, { employeeActive: false });
    expect(
      screen.queryByRole("button", { name: "Revise salary" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Inactive employees cannot receive salary changes."),
    ).toBeInTheDocument();
  });

  it("history lists rows in given order with change cells", () => {
    renderSection({ ok: true, data: populated });
    const table = screen.getByRole("table", { name: "Salary history" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent("2027-01-01");
    expect(rows[0]).toHaveTextContent("Scheduled");
    expect(rows[0]).toHaveTextContent("+₹500.00 (9.09%)");
    expect(rows[1]).toHaveTextContent("+$300.00 (5.77%)");
    expect(rows[1]).toHaveTextContent("Hannah HR");
    expect(rows[2]).toHaveTextContent("—");
    expect(rows[3]).toHaveTextContent("-$100.00 (-2.00%)");
    expect(within(rows[2]!).getByText("Previous")).toBeInTheDocument();
  });

  it("handles no current salary with scheduled changes", () => {
    renderSection({
      ok: true,
      data: { current: null, scheduled, history: [scheduled] },
    });
    expect(
      screen.getByText(
        "No current salary yet. Scheduled changes are listed below.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Salary history" }),
    ).toBeInTheDocument();
  });

  it("offers revise (not set) when the only record is scheduled", async () => {
    const handlers = renderSection({
      ok: true,
      data: { current: null, scheduled, history: [scheduled] },
    });
    expect(
      screen.queryByRole("button", { name: "Set salary" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Revise salary" }),
    );
    expect(handlers.onReviseSalary).toHaveBeenCalledTimes(1);
  });

  it("hides revise for an inactive employee with only a scheduled record", () => {
    renderSection(
      { ok: true, data: { current: null, scheduled, history: [scheduled] } },
      { employeeActive: false },
    );
    expect(
      screen.queryByRole("button", { name: "Revise salary" }),
    ).not.toBeInTheDocument();
  });
});
