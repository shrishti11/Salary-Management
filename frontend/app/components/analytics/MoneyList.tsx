import { Box, Typography } from "@mui/material";

import type { MoneyLine } from "~/lib/analytics-api";
import { formatMoney } from "~/lib/currencies";

export default function MoneyList({ lines, empty = "No salary data" }: { lines: MoneyLine[]; empty?: string }) {
  if (lines.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {empty}
      </Typography>
    );
  }
  return (
    <Box>
      {lines.map((line) => (
        <Typography key={line.currency} variant="body2">
          <strong>{line.currency}</strong> total {formatMoney(line.total, line.currency)} · avg{" "}
          {formatMoney(line.average, line.currency)} ({line.count})
        </Typography>
      ))}
    </Box>
  );
}
