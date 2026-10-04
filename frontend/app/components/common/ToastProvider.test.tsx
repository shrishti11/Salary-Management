import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { ToastProvider, useToast } from "./ToastProvider";

function Trigger({ withAction = false }: { withAction?: boolean }) {
  const toast = useToast();
  return (
    <>
      <button
        onClick={() =>
          withAction ? toast.success("Saved!", { label: "View", to: "/employees/1" }) : toast.success("Saved!")
        }
      >
        go
      </button>
      <button onClick={() => toast.error("Nope")}>fail</button>
    </>
  );
}

describe("ToastProvider", () => {
  it("shows a success message with status role", async () => {
    const router = createMemoryRouter([{ path: "/", element: <ToastProvider><Trigger /></ToastProvider> }]);
    render(<RouterProvider router={router} />);
    await userEvent.click(await screen.findByText("go"));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved!");
  });

  it("shows an error with alert role", async () => {
    const router = createMemoryRouter([{ path: "/", element: <ToastProvider><Trigger /></ToastProvider> }]);
    render(<RouterProvider router={router} />);
    await userEvent.click(await screen.findByText("fail"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nope");
  });

  it("renders an action link", async () => {
    const router = createMemoryRouter([{ path: "/", element: <ToastProvider><Trigger withAction /></ToastProvider> }]);
    render(<RouterProvider router={router} />);
    await userEvent.click(await screen.findByText("go"));
    const link = await screen.findByRole("link", { name: "View" });
    expect(link).toHaveAttribute("href", "/employees/1");
  });
});
