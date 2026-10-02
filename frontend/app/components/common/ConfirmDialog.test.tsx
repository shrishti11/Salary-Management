import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ConfirmDialog from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("shows the message and calls the handlers", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open title="Deactivate?" message="They stay in the directory." confirmLabel="Deactivate" onConfirm={onConfirm} onCancel={onCancel} />,
    );

    expect(screen.getByRole("dialog", { name: "Deactivate?" })).toBeInTheDocument();
    expect(screen.getByText("They stay in the directory.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons while loading and renders nothing when closed", async () => {
    const { rerender } = render(
      <ConfirmDialog open loading title="T" message="M" confirmLabel="Go" onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Go" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    rerender(<ConfirmDialog open={false} title="T" message="M" confirmLabel="Go" onConfirm={() => {}} onCancel={() => {}} />);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
