import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import EmployeeFormDialog from "./EmployeeFormDialog";

const departments = [{ id: "d1", name: "Engineering" }];

type Props = React.ComponentProps<typeof EmployeeFormDialog>;

function setup(props: Partial<Props> = {}) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <EmployeeFormDialog open mode="create" departments={departments} submitting={false} onClose={onClose} onSubmit={onSubmit} {...props} />,
  );
  return { onSubmit, onClose, ...utils };
}

const dialog = () => within(screen.getByRole("dialog"));

async function fillValid() {
  const d = dialog();
  await userEvent.type(d.getByLabelText("Employee ID"), "emp-9");
  await userEvent.type(d.getByLabelText("First name"), "Asha");
  await userEvent.type(d.getByLabelText("Last name"), "Rao");
  await userEvent.type(d.getByLabelText("Work email"), "asha@example.com");
  await userEvent.selectOptions(d.getByLabelText("Department"), "d1");
  await userEvent.type(d.getByLabelText("Designation"), "Engineer");
  await userEvent.selectOptions(d.getByLabelText("Country"), "IN");
  await userEvent.type(d.getByLabelText("Joining date"), "2024-01-15");
}

describe("EmployeeFormDialog", () => {
  it("shows the create title and submit label", () => {
    setup();
    expect(dialog().getByRole("heading", { name: "Add employee" })).toBeInTheDocument();
    expect(dialog().getByRole("button", { name: "Add employee" })).toBeInTheDocument();
  });

  it("shows the edit title and submit label", () => {
    setup({ mode: "edit" });
    expect(dialog().getByRole("heading", { name: "Edit employee" })).toBeInTheDocument();
    expect(dialog().getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("blocks submit and shows required errors when fields are empty", async () => {
    const { onSubmit } = setup();
    await userEvent.click(dialog().getByRole("button", { name: "Add employee" }));
    expect(await screen.findByText("Employee ID is required")).toBeInTheDocument();
    expect(screen.getByText("First name is required")).toBeInTheDocument();
    expect(screen.getByText("Select a department")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("focuses the first invalid field on submit", async () => {
    setup();
    await userEvent.click(dialog().getByRole("button", { name: "Add employee" }));
    await waitFor(() => expect(dialog().getByLabelText("First name")).toHaveFocus());
  });

  it("rejects an invalid email and a future date", async () => {
    setup();
    await userEvent.type(dialog().getByLabelText("Work email"), "nope");
    await userEvent.type(dialog().getByLabelText("Joining date"), "2999-01-01");
    await userEvent.click(dialog().getByRole("button", { name: "Add employee" }));
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Joining date cannot be in the future")).toBeInTheDocument();
  });

  it("submits values when valid", async () => {
    const { onSubmit } = setup();
    await fillValid();
    await userEvent.click(dialog().getByRole("button", { name: "Add employee" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      employeeCode: "emp-9",
      firstName: "Asha",
      email: "asha@example.com",
      departmentId: "d1",
      country: "IN",
      joiningDate: "2024-01-15",
      phone: "",
    });
  });

  it("shows Saving while submitting", () => {
    setup({ submitting: true });
    expect(dialog().getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("shows a duplicate-email server error on the email field and stays open", async () => {
    setup({ serverError: { message: "Email already exists", field: "email" } });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByText("Email already exists")).toBeInTheDocument();
    expect(dialog().getByLabelText("Work email")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a non-field server error at dialog level", () => {
    setup({ serverError: { message: "Something broke" } });
    expect(dialog().getByRole("alert")).toHaveTextContent("Something broke");
  });

  it("locks the employee ID in edit mode and prefills values", () => {
    setup({
      mode: "edit",
      defaultValues: { employeeCode: "EMP-1", firstName: "Asha", lastName: "Rao", email: "a@b.com", phone: "", departmentId: "d1", designation: "Eng", country: "IN", joiningDate: "2024-01-15" },
    });
    expect(dialog().getByLabelText("Employee ID")).toBeDisabled();
    expect(dialog().getByLabelText("Employee ID")).toHaveValue("EMP-1");
    expect(dialog().getByLabelText("First name")).toHaveValue("Asha");
  });

  it("calls onClose when Cancel is clicked", async () => {
    const { onClose } = setup();
    await userEvent.click(dialog().getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("resets to defaults when reopened", async () => {
    const props = { mode: "create" as const, departments, submitting: false, onClose: vi.fn(), onSubmit: vi.fn() };
    const { rerender } = render(<EmployeeFormDialog open {...props} />);
    await userEvent.type(dialog().getByLabelText("First name"), "Temp");
    rerender(<EmployeeFormDialog open={false} {...props} />);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    rerender(<EmployeeFormDialog open {...props} />);
    expect(await screen.findByLabelText("First name")).toHaveValue("");
  });
});
