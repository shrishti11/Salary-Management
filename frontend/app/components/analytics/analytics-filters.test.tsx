import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_ANALYTICS_PARAMS } from "~/lib/analytics-api";
import AnalyticsFilters from "./AnalyticsFilters";

const DEPT = "11111111-1111-4111-8111-111111111111";
const options = {
  departments: [{ id: DEPT, name: "Engineering" }],
  countries: ["US", "IN"],
  designations: ["Engineer"],
  currencies: ["USD", "INR"],
};

function setup(params = DEFAULT_ANALYTICS_PARAMS) {
  const onChange = vi.fn();
  const onClear = vi.fn();
  render(<AnalyticsFilters params={params} effectiveCurrency="USD" options={options} onChange={onChange} onClear={onClear} />);
  return { onChange, onClear };
}

describe("AnalyticsFilters", () => {
  it("emits a patch for each select", async () => {
    const { onChange } = setup();
    await userEvent.selectOptions(screen.getByLabelText("Department"), DEPT);
    expect(onChange).toHaveBeenLastCalledWith({ departmentId: DEPT });
    await userEvent.selectOptions(screen.getByLabelText("Country"), "US");
    expect(onChange).toHaveBeenLastCalledWith({ country: "US" });
    await userEvent.selectOptions(screen.getByLabelText("Role"), "Engineer");
    expect(onChange).toHaveBeenLastCalledWith({ designation: "Engineer" });
    await userEvent.selectOptions(screen.getByLabelText("Status"), "ALL");
    expect(onChange).toHaveBeenLastCalledWith({ status: "ALL" });
    await userEvent.selectOptions(screen.getByLabelText("Currency"), "INR");
    expect(onChange).toHaveBeenLastCalledWith({ currency: "INR" });
    await userEvent.selectOptions(screen.getByLabelText("Basis"), "net");
    expect(onChange).toHaveBeenLastCalledWith({ basis: "net" });
  });

  it("shows the effective currency and country names", () => {
    setup();
    expect(screen.getByLabelText("Currency")).toHaveValue("USD");
    expect(screen.getByRole("option", { name: "United States" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "India" })).toBeInTheDocument();
  });

  it("emits complete dates or the empty string only, and caps To at today", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText("As of"), { target: { value: "2025-01-31" } });
    expect(onChange).toHaveBeenLastCalledWith({ asOf: "2025-01-31" });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2024-01-01" } });
    expect(onChange).toHaveBeenLastCalledWith({ from: "2024-01-01" });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2024-12-31" } });
    expect(onChange).toHaveBeenLastCalledWith({ to: "2024-12-31" });
    expect(screen.getByLabelText("To")).toHaveAttribute("max", new Date().toISOString().slice(0, 10));
  });

  it("emits the empty string when a date is cleared", () => {
    const { onChange } = setup({ ...DEFAULT_ANALYTICS_PARAMS, to: "2024-12-31" });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith({ to: "" });
  });

  it("disables Reset filters when nothing is filtered and calls onClear otherwise", async () => {
    const first = setup();
    expect(screen.getByRole("button", { name: "Reset filters" })).toBeDisabled();
    expect(first.onClear).not.toHaveBeenCalled();
  });

  it("enables Reset filters when a filter is active", async () => {
    const { onClear } = setup({ ...DEFAULT_ANALYTICS_PARAMS, country: "US" });
    await userEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
