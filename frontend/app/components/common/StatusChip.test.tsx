import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import StatusChip from "./StatusChip";

describe("StatusChip", () => {
  it("labels active and inactive employees", () => {
    const { rerender } = render(<StatusChip status="ACTIVE" />);
    expect(screen.getByText("Active")).toBeInTheDocument();
    rerender(<StatusChip status="INACTIVE" />);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });
});
