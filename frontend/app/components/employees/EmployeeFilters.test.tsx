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

  it("does not overwrite newer typing when the URL echoes an older search", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <EmployeeFilters values={empty} departments={departments} onChange={onChange} onClear={() => {}} />,
    );
    const box = screen.getByLabelText("Search");

    await userEvent.type(box, "as");
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ q: "as" }), { timeout: 1500 });
    await userEvent.type(box, "h");

    rerender(<EmployeeFilters values={{ ...empty, q: "as" }} departments={departments} onChange={onChange} onClear={() => {}} />);
    expect(box).toHaveValue("ash");
  });

  it("updates the box when the URL value changes externally", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <EmployeeFilters values={empty} departments={departments} onChange={onChange} onClear={() => {}} />,
    );
    const box = screen.getByLabelText("Search");
    await userEvent.type(box, "as");
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ q: "as" }), { timeout: 1500 });
    rerender(<EmployeeFilters values={{ ...empty, q: "as" }} departments={departments} onChange={onChange} onClear={() => {}} />);

    rerender(<EmployeeFilters values={empty} departments={departments} onChange={onChange} onClear={() => {}} />);
    expect(box).toHaveValue("");

    rerender(<EmployeeFilters values={{ ...empty, q: "zed" }} departments={departments} onChange={onChange} onClear={() => {}} />);
    expect(box).toHaveValue("zed");
  });

  it("keeps a trailing space when the URL echoes the trimmed search", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <EmployeeFilters values={empty} departments={departments} onChange={onChange} onClear={() => {}} />,
    );
    const box = screen.getByLabelText("Search");

    await userEvent.type(box, "as ");
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ q: "as" }), { timeout: 1500 });
    rerender(<EmployeeFilters values={{ ...empty, q: "as" }} departments={departments} onChange={onChange} onClear={() => {}} />);

    expect(box).toHaveValue("as ");
  });
});
