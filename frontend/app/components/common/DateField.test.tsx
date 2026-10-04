import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import DateField from "./DateField";

describe("DateField", () => {
  it("is a date input with a visible calendar button that opens the native picker", async () => {
    const showPicker = vi.fn();
    HTMLInputElement.prototype.showPicker = showPicker;
    render(<DateField label="Joining date" value="2024-01-15" onChange={() => {}} />);

    expect(screen.getByLabelText("Joining date")).toHaveAttribute("type", "date");
    await userEvent.click(screen.getByRole("button", { name: "Open calendar for Joining date" }));
    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it("still works when the browser has no showPicker, and keeps min/max and refs", async () => {
    // @ts-expect-error simulate an older browser
    delete HTMLInputElement.prototype.showPicker;
    const ref = { current: null as HTMLInputElement | null };
    render(<DateField label="As of" value="" onChange={() => {}} inputRef={ref} slotProps={{ htmlInput: { max: "2026-10-04" } }} />);

    await userEvent.click(screen.getByRole("button", { name: "Open calendar for As of" }));
    expect(ref.current).toBe(screen.getByLabelText("As of"));
    expect(screen.getByLabelText("As of")).toHaveAttribute("max", "2026-10-04");
  });

  it("disables the button with the field", () => {
    render(<DateField label="Date" value="" onChange={() => {}} disabled />);
    expect(screen.getByRole("button", { name: "Open calendar for Date" })).toBeDisabled();
  });
});
