import { Chip } from "@mui/material";

import type { EmployeeStatus } from "~/lib/employees-api";

export default function StatusChip({ status }: { status: EmployeeStatus }) {
  return (
    <Chip
      size="small"
      label={status === "ACTIVE" ? "Active" : "Inactive"}
      color={status === "ACTIVE" ? "success" : "default"}
      variant="outlined"
    />
  );
}
