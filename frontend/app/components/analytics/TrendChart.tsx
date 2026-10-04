import { Box, useTheme } from "@mui/material";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { TrendMonth } from "~/lib/analytics-api";
import ClientOnly from "./ClientOnly";

export default function TrendChart({ currency, months }: { currency: string; months: TrendMonth[] }) {
  const theme = useTheme();
  const data = months.map((m) => ({
    month: m.month,
    revisions: m.revisionCount,
    change: m.avgChangePercent === null ? null : Number(m.avgChangePercent),
  }));
  return (
    <Box role="img" aria-label={`Salary revisions and average change over time in ${currency}`} sx={{ height: 300 }}>
      <ClientOnly>
        {() => (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" allowDecimals={false} width={40} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} width={48} />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="revisions" name="Revisions" fill={theme.palette.primary.main} />
              <Line yAxisId="right" dataKey="change" name="Avg change %" stroke={theme.palette.grey[600]} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ClientOnly>
    </Box>
  );
}
