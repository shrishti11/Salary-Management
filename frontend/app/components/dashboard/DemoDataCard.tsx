import { Box, Button, CircularProgress, Paper, Typography } from "@mui/material";
import { useState } from "react";

import ConfirmDialog from "~/components/common/ConfirmDialog";
import type { DemoDataStatus } from "~/lib/demo-data-api";

interface Props {
  status: DemoDataStatus;
  seeding: boolean;
  onSeed: () => void;
  onReseed: () => void;
}

const number = new Intl.NumberFormat("en-US");

/** Admin-only. Loads the demo company with one click; once loaded it offers a confirmed "Reseed". */
export default function DemoDataCard({ status, seeding, onSeed, onReseed }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const target = number.format(status.target);

  if (seeding) {
    return (
      <Paper variant="outlined" sx={{ p: 2, mb: 2, display: "flex", gap: 1.5, alignItems: "center" }}>
        <CircularProgress size={18} />
        <Typography>Loading {target} demo employees… this takes a few seconds.</Typography>
      </Paper>
    );
  }

  if (status.seeded) {
    return (
      <Paper variant="outlined" sx={{ p: 2, mb: 2, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 240 }}>
          Demo data loaded: {number.format(status.count)} employees with salary history.
        </Typography>
        <Button variant="outlined" size="small" onClick={() => setConfirmOpen(true)}>
          Reseed demo data
        </Button>
        <ConfirmDialog
          open={confirmOpen}
          title="Reseed demo data?"
          message={`This deletes the demo employees and their salary history, then creates a fresh set of ${target}. Employees you added yourself are kept.`}
          confirmLabel="Reseed"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            onReseed();
          }}
        />
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
      <Box sx={{ flex: 1, minWidth: 240 }}>
        <Typography variant="subtitle1" component="h2">
          Load demo data
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Creates {target} employees across departments and countries, each with salary history and some with scheduled
          revisions. Safe to click again: it never adds more than {target}.
        </Typography>
      </Box>
      <Button variant="contained" onClick={onSeed}>
        Load demo data
      </Button>
    </Paper>
  );
}
