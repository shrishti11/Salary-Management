import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import EmployeeForm from "./EmployeeForm";

const departments = [{ id: "d1", name: "Engineering" }];

function setup(props: Partial<React.ComponentProps<typeof EmployeeForm>> = {}) {
  const onSubmit = vi.fn();
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <EmployeeForm mode="create" departments={departments} submitting={false} cancelHref="/employees" onSubmit={onSubmit} {...props} />
        ),
      },
    ],
    { initialEntries: ["/"] },
  );
  render(<RouterProvider router={router} />);
  return onSubmit;
}

async function fillValid() {
  await userEvent.type(screen.getByLabelText("Employee ID"), "emp-9");
  await userEvent.type(screen.getByLabelText("First name"), "Asha");
  await userEvent.type(screen.getByLabelText("Last name"), "Rao");
  await userEvent.type(screen.getByLabelText("Email"), "asha@example.com");
  await userEvent.selectOptions(screen.getByLabelText("Department"), "d1");
  await userEvent.type(screen.getByLabelText("Designation"), "Engineer");
  await userEvent.selectOptions(screen.getByLabelText("Country"), "IN");
  await userEvent.type(screen.getByLabelText("Joining date"), "2024-01-15");
}

describe("EmployeeForm", () => {
  it("shows field-level errors and does not submit an empty form", async () => {
    const onSubmit = setup();

    await userEvent.click(screen.getByRole("button", { name: "Save employee" }));

    expect(await screen.findByText("Employee ID is required")).toBeInTheDocument();
    expect(screen.getByText("First name is required")).toBeInTheDocument();
    expect(screen.getByText("Select a department")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("focuses the first invalid field on submit", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Save employee" }));
    await waitFor(() => expect(screen.getByLabelText("Employee ID")).toHaveFocus());
  });

  it("rejects an invalid email and a future date", async () => {
    setup();
    await userEvent.type(screen.getByLabelText("Email"), "nope");
    await userEvent.type(screen.getByLabelText("Joining date"), "2999-01-01");
    await userEvent.click(screen.getByRole("button", { name: "Save employee" }));

    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Joining date cannot be in the future")).toBeInTheDocument();
  });

  it("submits trimmed values when valid", async () => {
    const onSubmit = setup();
    await fillValid();
    await userEvent.click(screen.getByRole("button", { name: "Save employee" }));

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

  it("disables the submit button while submitting", () => {
    setup({ submitting: true });
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("shows a server error on the matching field and as a summary", async () => {
    setup({ serverError: { message: "Email already in use", field: "email" } });
    expect((await screen.findAllByText("Email already in use")).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("locks the employee ID in edit mode and prefills values", () => {
    setup({
      mode: "edit",
      defaultValues: { employeeCode: "EMP-1", firstName: "Asha", lastName: "Rao", email: "a@b.com", phone: "", departmentId: "d1", designation: "Eng", country: "IN", joiningDate: "2024-01-15" },
    });
    expect(screen.getByLabelText("Employee ID")).toBeDisabled();
    expect(screen.getByLabelText("Employee ID")).toHaveValue("EMP-1");
    expect(screen.getByLabelText("First name")).toHaveValue("Asha");
  });

  it("links Cancel back to the given page", () => {
    setup();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/employees");
  });
});
