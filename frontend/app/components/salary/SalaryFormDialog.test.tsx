import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import SalaryFormDialog from "./SalaryFormDialog";
import { makeSalary } from "./fixtures";

type Props = Parameters<typeof SalaryFormDialog>[0];

function setup(props: Partial<Props> = {}) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  const base: Props = {
    open: true,
    mode: "initial",
    current: null,
    minDate: "2026-02-01",
    submitting: false,
    onClose,
    onSubmit,
  };
  const utils = render(<SalaryFormDialog {...base} {...props} />);
  return { onSubmit, onClose, ...utils, base };
}

describe("SalaryFormDialog", () => {
  it("initial mode: titled, defaults currency to USD, applies minDate", () => {
    setup();
    expect(
      screen.getByRole("dialog", { name: "Set salary" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Currency")).toHaveValue("USD");
    expect(screen.getByLabelText("Effective date")).toHaveAttribute(
      "min",
      "2026-02-01",
    );
  });

  it("initial mode: validates required fields", async () => {
    const { onSubmit } = setup();
    await userEvent.selectOptions(screen.getByLabelText("Currency"), "");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Select a currency")).toBeInTheDocument();
    expect(screen.getByText("Effective date is required")).toBeInTheDocument();
    expect(
      screen.getByText("Enter an amount like 5000 or 5000.50"),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("initial mode: submits values directly", async () => {
    const { onSubmit } = setup();
    await userEvent.type(screen.getByLabelText("Effective date"), "2026-03-01");
    await userEvent.type(screen.getByLabelText("Base salary"), "5000");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0]).toEqual({
      currency: "USD",
      effectiveDate: "2026-03-01",
      reason: "",
      baseAmount: "5000",
      extras: [],
    });
  });

  it("updates live totals and removes rows", async () => {
    setup();
    const totals = screen.getByTestId("salary-totals");
    expect(totals).toHaveTextContent("Net—");
    await userEvent.type(screen.getByLabelText("Base salary"), "1000");
    expect(totals).toHaveTextContent("Gross$1,000.00");
    await userEvent.click(
      screen.getByRole("button", { name: "Add component" }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Component type"),
      "DEDUCTION",
    );
    await userEvent.type(screen.getByLabelText("Component name"), "Tax");
    await userEvent.type(screen.getByLabelText("Component amount"), "250");
    expect(totals).toHaveTextContent("Deductions$250.00");
    expect(totals).toHaveTextContent("Net$750.00");
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByLabelText("Component name")).not.toBeInTheDocument();
    expect(totals).toHaveTextContent("Net$1,000.00");
  });

  describe("revise mode", () => {
    const current = makeSalary();
    const props = { mode: "revise" as const, current };

    it("prefills, requires reason, and confirms before submitting", async () => {
      const { onSubmit } = setup(props);
      expect(
        screen.getByRole("dialog", { name: "Revise salary" }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Base salary")).toHaveValue("5000.00");
      expect(
        screen
          .getAllByLabelText("Component name")
          .map((e) => (e as HTMLInputElement).value),
      ).toEqual(["Housing", "Tax"]);

      await userEvent.type(
        screen.getByLabelText("Effective date"),
        "2026-03-01",
      );
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(
        await screen.findByText("Reason is required (at least 3 characters)"),
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();

      await userEvent.type(screen.getByLabelText("Reason"), "Promotion");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      const confirm = await screen.findByRole("dialog", {
        name: "Save salary revision?",
      });
      expect(confirm).toHaveTextContent("$4,800.00");
      expect(confirm).toHaveTextContent("2026-03-01");
      expect(onSubmit).not.toHaveBeenCalled();

      await userEvent.click(
        within(confirm).getByRole("button", { name: "Save revision" }),
      );
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit.mock.calls[0]![0]).toMatchObject({
        reason: "Promotion",
        baseAmount: "5000.00",
      });
    });

    it("does not submit when the confirmation is cancelled", async () => {
      const { onSubmit } = setup(props);
      await userEvent.type(
        screen.getByLabelText("Effective date"),
        "2026-03-01",
      );
      await userEvent.type(screen.getByLabelText("Reason"), "Promotion");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      const confirm = await screen.findByRole("dialog", {
        name: "Save salary revision?",
      });
      await userEvent.click(
        within(confirm).getByRole("button", { name: "Cancel" }),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Save salary revision?" }),
        ).not.toBeInTheDocument(),
      );
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  it("shows a field server error under the field", async () => {
    setup({
      serverError: { message: "Date already used", field: "effectiveDate" },
    });
    expect(await screen.findByText("Date already used")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a field-less server error as an alert", () => {
    setup({ serverError: { message: "Something broke" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Something broke");
  });

  it("disables buttons while submitting", () => {
    setup({ submitting: true });
    expect(screen.getByRole("button", { name: /Saving|Save/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("cancel calls onClose", async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("resets to fresh defaults when reopened", async () => {
    const { rerender, base } = setup();
    await userEvent.type(screen.getByLabelText("Base salary"), "123");
    rerender(<SalaryFormDialog {...base} open={false} />);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    rerender(<SalaryFormDialog {...base} open />);
    expect(await screen.findByLabelText("Base salary")).toHaveValue("");
  });
});
