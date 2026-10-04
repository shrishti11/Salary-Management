import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import FormDialog from "./FormDialog";

describe("FormDialog", () => {
  it("submits, cancels, and shows an error", async () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    const onClose = vi.fn();
    render(
      <FormDialog open title="Add thing" submitLabel="Save" error="Boom" onSubmit={onSubmit} onClose={onClose}>
        <input aria-label="x" />
      </FormDialog>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("disables actions while submitting", () => {
    render(<FormDialog open title="T" submitLabel="Save" submitting onSubmit={vi.fn()} onClose={vi.fn()}><span /></FormDialog>);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
