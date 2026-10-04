import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";

export default function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <Box sx={{ textAlign: "center", py: 8, px: 2 }}>
      <Typography variant="h6" gutterBottom>{title}</Typography>
      {description && <Typography color="text.secondary" sx={{ mb: action ? 2 : 0 }}>{description}</Typography>}
      {action}
    </Box>
  );
}
