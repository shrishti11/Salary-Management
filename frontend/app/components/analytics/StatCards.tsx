import { Box, Typography } from "@mui/material";

import type { Basis, SummaryData } from "~/lib/analytics-api";
import { formatMoney } from "~/lib/currencies";
import MetricCard from "./MetricCard";

export default function StatCards({ summary, currency, basis }: { summary: SummaryData; currency: string; basis: Basis }) {
  const stats = summary.currencies.find((c) => c.currency === currency);
  if (!stats) return null;
  const money = (value: string) => formatMoney(value, currency);
  const cards: [string, string][] = [
    ["Employees", String(stats.count)],
    ["Total", money(stats.total)],
    ["Average", money(stats.average)],
    ["Median", money(stats.median)],
    ["Min", money(stats.min)],
    ["Max", money(stats.max)],
    ["P25", money(stats.p25)],
    ["P75", money(stats.p75)],
  ];
  return (
    <>
      <Typography variant="subtitle1" component="h3" sx={{ mb: 1 }}>
        Compensation summary ({basis}, {currency})
      </Typography>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, "& > *": { minWidth: 0 } }}>
        {cards.map(([label, value]) => (
          <MetricCard key={label} label={label} value={value} />
        ))}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {summary.headcount.withSalary} with salary · {summary.headcount.withoutSalary} without
      </Typography>
    </>
  );
}
