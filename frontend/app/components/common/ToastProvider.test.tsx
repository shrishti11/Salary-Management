import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
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
      <button onClick={() => toast.success("Second")}>second</button>
      <p>elsewhere</p>
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

  it("keeps the message visible while the toast animates out after dismissal", async () => {
    const router = createMemoryRouter([{ path: "/", element: <ToastProvider><Trigger /></ToastProvider> }]);
    render(<RouterProvider router={router} />);
    await userEvent.click(await screen.findByText("go"));
    await userEvent.click(await screen.findByRole("button", { name: "Close" }));
    // Mid-exit transition the Alert must still carry its text rather than flash empty.
    expect(screen.getByRole("status")).toHaveTextContent("Saved!");
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("ignores clicks elsewhere on the page", async () => {
    const router = createMemoryRouter([{ path: "/", element: <ToastProvider><Trigger /></ToastProvider> }]);
    render(<RouterProvider router={router} />);
    await userEvent.click(await screen.findByText("go"));
    await screen.findByRole("status");
    await userEvent.click(screen.getByText("elsewhere"));
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByRole("status")).toHaveTextContent("Saved!");
  });

  it("closes the toast when its action link is followed", async () => {
    // Provider lives above the routes (as in root.tsx), so navigation alone does not unmount it.
    const router = createMemoryRouter([
      {
        path: "/",
        element: <ToastProvider><Outlet /></ToastProvider>,
        children: [
          { index: true, element: <Trigger withAction /> },
          { path: "employees/:id", element: <p>profile</p> },
        ],
      },
    ]);
    render(<RouterProvider router={router} />);
    await userEvent.click(await screen.findByText("go"));
    await userEvent.click(await screen.findByRole("link", { name: "View" }));
    expect(await screen.findByText("profile")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  describe("with fake timers", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("restarts the auto-hide timer when a new toast replaces the current one", () => {
      vi.useFakeTimers();
      const router = createMemoryRouter([{ path: "/", element: <ToastProvider><Trigger /></ToastProvider> }]);
      render(<RouterProvider router={router} />);
      fireEvent.click(screen.getByText("go"));
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      fireEvent.click(screen.getByText("second"));
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.getByRole("status")).toHaveTextContent("Second");
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });
});
