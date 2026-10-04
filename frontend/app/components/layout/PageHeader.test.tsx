import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import PageHeader from "./PageHeader";

describe("PageHeader", () => {
  it("renders title, breadcrumbs and subtitle", async () => {
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <PageHeader
            title="Ada"
            subtitle="Engineer"
            breadcrumbs={[{ label: "Employees", to: "/employees" }, { label: "Ada" }]}
          />
        ),
      },
    ]);
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole("link", { name: "Employees" })).toHaveAttribute("href", "/employees");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ada");
    expect(screen.queryByRole("link", { name: "Ada" })).toBeNull();
    expect(screen.getByText("Engineer")).toBeInTheDocument();
  });

  it("renders a leading element and a title adornment beside the title", async () => {
    const router = createMemoryRouter([
      {
        path: "/",
        element: <PageHeader title="Ada" leading={<span>AL</span>} titleAdornment={<span>Active</span>} />,
      },
    ]);
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Ada");
    expect(screen.getByText("AL")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });
});
