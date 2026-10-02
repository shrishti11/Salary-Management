import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import SalaryDirectoryFilters, { type SalaryFilterValues } from "./SalaryDirectoryFilters";

const defaults: SalaryFilterValues = { q: "", departmentId: "", country: "", status: "ACTIVE", salary: "" };
const departments = [{ id: "d1", name: "Engineering" }];

const setup = (values = defaults, onChange = vi.fn(), onClear = vi.fn()) => {
  const utils = render(<SalaryDirectoryFilters values={values} departments={departments} onChange={onChange} onClear={onClear} />);
  return { ...utils, onChange, onClear };
};

describe("SalaryDirectoryFilters", () => {
  it("offers Active (default), Inactive and All statuses and the salary presence filter", () => {
    setup();
    expect(screen.getByLabelText("Status")).toHaveValue("ACTIVE");
    expect(screen.getByRole("option", { name: "Inactive" })).toBeInTheDocument();
    expect(screen.getByLabelText("Salary")).toHaveValue("");
    expect(screen.getByRole("option", { name: "With salary" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Without salary" })).toBeInTheDocument();
  });

  it("emits patches for selects", async () => {
    const { onChange } = setup();
    await userEvent.selectOptions(screen.getByLabelText("Status"), "ALL");
    expect(onChange).toHaveBeenCalledWith({ status: "ALL" });
    await userEvent.selectOptions(screen.getByLabelText("Salary"), "without");
    expect(onChange).toHaveBeenCalledWith({ salary: "without" });
    await userEvent.selectOptions(screen.getByLabelText("Department"), "d1");
    expect(onChange).toHaveBeenCalledWith({ departmentId: "d1" });
    await userEvent.selectOptions(screen.getByLabelText("Country"), "IN");
    expect(onChange).toHaveBeenCalledWith({ country: "IN" });
  });

  it("debounces search into a single change", async () => {
    const { onChange } = setup();
    await userEvent.type(screen.getByLabelText("Search"), "asha");
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ q: "asha" }), { timeout: 1500 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("shows Clear filters only for non-default state", async () => {
    const { rerender, onClear } = setup();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
    rerender(<SalaryDirectoryFilters values={{ ...defaults, status: "ALL" }} departments={departments} onChange={vi.fn()} onClear={onClear} />);
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalled();
  });

  it("keeps typed text when the URL echoes an older value, and follows external clears", async () => {
    const onChange = vi.fn();
    const { rerender } = setup(defaults, onChange);
    const box = screen.getByLabelText("Search");
    await userEvent.type(box, "as");
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ q: "as" }), { timeout: 1500 });
    await userEvent.type(box, "h");
    rerender(<SalaryDirectoryFilters values={{ ...defaults, q: "as" }} departments={departments} onChange={onChange} onClear={() => {}} />);
    expect(box).toHaveValue("ash");

    rerender(<SalaryDirectoryFilters values={{ ...defaults, q: "zed" }} departments={departments} onChange={onChange} onClear={() => {}} />);
    expect(box).toHaveValue("zed");
  });
});
