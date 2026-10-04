import { Box, Button, CircularProgress, Paper, Typography } from "@mui/material";

import type { DemoDataStatus } from "~/lib/demo-data-api";

interface Props {
  status: DemoDataStatus;
  seeding: boolean;
  onSeed: () => void;
}

const number = new Intl.NumberFormat("en-US");

/** Admin-only. One button loads the whole demo company; once loaded it shrinks to a quiet status line. */
export default function DemoDataCard({ status, seeding, onSeed }: Props) {
  if (status.seeded && !seeding) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Demo data loaded: {number.format(status.count)} employees with salary history.
      </Typography>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
      <Box sx={{ flex: 1, minWidth: 240 }}>
        <Typography variant="subtitle1" component="h2">
          Load demo data
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Creates {number.format(status.target)} employees across departments and countries, with salary history, scheduled
          revisions and a few employees without a salary. Safe to click again: it never adds more than{" "}
          {number.format(status.target)}.
        </Typography>
      </Box>
      <Button
        variant="contained"
        onClick={onSeed}
        disabled={seeding}
        startIcon={seeding ? <CircularProgress size={16} color="inherit" /> : undefined}
      >
        {seeding ? "Loading… this takes a few seconds" : "Load demo data"}
      </Button>
    </Paper>
  );
}
