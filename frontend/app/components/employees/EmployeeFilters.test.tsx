import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import EmployeeFilters from "./EmployeeFilters";

const departments = [
  { id: "d1", name: "Engineering" },
  { id: "d2", name: "Finance" },
];
const empty = { q: "", departmentId: "", country: "", status: "" as const };

describe("EmployeeFilters", () => {
  it("debounces search input", async () => {
    const onChange = vi.fn();
    render(<EmployeeFilters values={empty} departments={departments} onChange={onChange} onClear={() => {}} />);

    await userEvent.type(screen.getByLabelText("Search"), "asha");

    expect(onChange).not.toHaveBeenCalledWith({ q: "a" });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ q: "asha" }), { timeout: 1500 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("reports department, country and status changes", async () => {
    const onChange = vi.fn();
    render(<EmployeeFilters values={empty} departments={departments} onChange={onChange} onClear={() => {}} />);

    await userEvent.selectOptions(screen.getByLabelText("Department"), "d2");
    expect(onChange).toHaveBeenLastCalledWith({ departmentId: "d2" });
    await userEvent.selectOptions(screen.getByLabelText("Country"), "IN");
    expect(onChange).toHaveBeenLastCalledWith({ country: "IN" });
    await userEvent.selectOptions(screen.getByLabelText("Status"), "INACTIVE");
    expect(onChange).toHaveBeenLastCalledWith({ status: "INACTIVE" });
  });

  it("offers Clear only when a filter is active", async () => {
    const onClear = vi.fn();
    const { rerender } = render(
      <EmployeeFilters values={empty} departments={departments} onChange={() => {}} onClear={onClear} />,
    );
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();

    rerender(
      <EmployeeFilters values={{ ...empty, status: "ACTIVE" }} departments={departments} onChange={() => {}} onClear={onClear} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalled();
  });
});
