import { Box, useTheme } from "@mui/material";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import ClientOnly from "./ClientOnly";

export interface BarDatum {
  label: string;
  value: number;
}

interface Props {
  data: BarDatum[];
  ariaLabel: string;
  valueLabel: string;
  formatValue?: (value: number) => string;
}

/** Values are chart-only floats (display); exact amounts are shown in the adjacent table. */
export default function BarChartCard({ data, ariaLabel, valueLabel, formatValue = String }: Props) {
  const theme = useTheme();
  return (
    <Box role="img" aria-label={ariaLabel} sx={{ height: 280 }}>
      <ClientOnly>
        {() => (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
              <XAxis dataKey="label" interval={0} tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={formatValue} width={72} />
              <Tooltip formatter={(value) => [formatValue(Number(value)), valueLabel]} />
              <Bar dataKey="value" name={valueLabel} fill={theme.palette.primary.main} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ClientOnly>
    </Box>
  );
}
