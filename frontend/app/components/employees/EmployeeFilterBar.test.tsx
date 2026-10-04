import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import EmployeeFilterBar, { hasActiveFilters, type EmployeeFilterValues } from "./EmployeeFilterBar";

const defaults: EmployeeFilterValues = { q: "", departmentId: "", country: "", status: "ACTIVE", salary: "" };
const departments = [{ id: "d1", name: "Engineering" }];

const setup = (values = defaults, onChange = vi.fn(), onClear = vi.fn()) => {
  const utils = render(<EmployeeFilterBar values={values} departments={departments} onChange={onChange} onClear={onClear} />);
  return { ...utils, onChange, onClear };
};

const openFilters = () => userEvent.click(screen.getByRole("button", { name: /^Filters/ }));

describe("EmployeeFilterBar", () => {
  it("shows Active selected by default and emits status changes", async () => {
    const { onChange } = setup();
    expect(screen.getByRole("button", { name: "Active" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onChange).toHaveBeenCalledWith({ status: "ALL" });
    await userEvent.click(screen.getByRole("button", { name: "Inactive" }));
    expect(onChange).toHaveBeenCalledWith({ status: "INACTIVE" });
  });

  it("ignores a click on the already-selected status", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Active" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("emits department, country and salary changes from the Filters popover", async () => {
    const { onChange } = setup();
    await openFilters();
    const popover = within(screen.getByRole("presentation"));
    await userEvent.selectOptions(popover.getByLabelText("Department"), "d1");
    expect(onChange).toHaveBeenCalledWith({ departmentId: "d1" });
    await userEvent.selectOptions(popover.getByLabelText("Country"), "IN");
    expect(onChange).toHaveBeenCalledWith({ country: "IN" });
    expect(popover.getByRole("option", { name: "Has salary" })).toBeInTheDocument();
    await userEvent.selectOptions(popover.getByLabelText("Salary"), "without");
    expect(onChange).toHaveBeenCalledWith({ salary: "without" });
  });

  it("counts active popover filters on the Filters button", () => {
    setup({ ...defaults, departmentId: "d1", salary: "with" });
    expect(screen.getByRole("button", { name: "Filters (2 active)" })).toBeInTheDocument();
  });

  it("debounces search into a single change", async () => {
    const { onChange } = setup();
    await userEvent.type(screen.getByLabelText("Search"), "asha");
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ q: "asha" }), { timeout: 1500 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("shows Clear only for non-default state", async () => {
    const { rerender, onClear } = setup();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    rerender(<EmployeeFilterBar values={{ ...defaults, status: "ALL" }} departments={departments} onChange={vi.fn()} onClear={onClear} />);
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalled();
  });

  it("keeps typed text when the URL echoes an older value, and follows external clears", async () => {
    const onChange = vi.fn();
    const { rerender } = setup(defaults, onChange);
    const box = screen.getByLabelText("Search");
    await userEvent.type(box, "as");
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ q: "as" }), { timeout: 1500 });
    await userEvent.type(box, "h");
    rerender(<EmployeeFilterBar values={{ ...defaults, q: "as" }} departments={departments} onChange={onChange} onClear={() => {}} />);
    expect(box).toHaveValue("ash");

    rerender(<EmployeeFilterBar values={{ ...defaults, q: "zed" }} departments={departments} onChange={onChange} onClear={() => {}} />);
    expect(box).toHaveValue("zed");
  });

  it("keeps a trailing space when the URL echoes the trimmed search", async () => {
    const onChange = vi.fn();
    const { rerender } = setup(defaults, onChange);
    const box = screen.getByLabelText("Search");

    await userEvent.type(box, "as ");
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ q: "as" }), { timeout: 1500 });
    rerender(<EmployeeFilterBar values={{ ...defaults, q: "as" }} departments={departments} onChange={onChange} onClear={() => {}} />);

    expect(box).toHaveValue("as ");
  });

  it("treats search, popover filters and non-Active status as active filters", () => {
    expect(hasActiveFilters(defaults)).toBe(false);
    expect(hasActiveFilters({ ...defaults, q: "a" })).toBe(true);
    expect(hasActiveFilters({ ...defaults, salary: "without" })).toBe(true);
    expect(hasActiveFilters({ ...defaults, status: "INACTIVE" })).toBe(true);
  });
});
