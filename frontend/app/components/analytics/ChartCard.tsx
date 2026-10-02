import { Alert, Box, Paper, Typography } from "@mui/material";
import type { ReactNode } from "react";

import type { Result } from "~/lib/analytics-api";

interface Props {
  title: string;
  subtitle?: string;
  result?: Result<unknown>;
  empty?: string;
  children: ReactNode;
}

export default function ChartCard({ title, subtitle, result, empty, children }: Props) {
  return (
    <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
      <Typography variant="h6" component="h2">
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {subtitle}
        </Typography>
      )}
      {result && !result.ok ? (
        <Alert severity="error">Could not load {title.toLowerCase()}.</Alert>
      ) : empty ? (
        <Box sx={{ py: 4, textAlign: "center" }}>
          <Typography color="text.secondary">{empty}</Typography>
        </Box>
      ) : (
        children
      )}
    </Paper>
  );
}
