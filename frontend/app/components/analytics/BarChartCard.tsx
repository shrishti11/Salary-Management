import { Box } from "@mui/material";
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
  return (
    <Box role="img" aria-label={ariaLabel} sx={{ height: 280 }}>
      <ClientOnly>
        {() => (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" interval={0} tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={formatValue} width={72} />
              <Tooltip formatter={(value) => [formatValue(Number(value)), valueLabel]} />
              <Bar dataKey="value" name={valueLabel} fill="#1976d2" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ClientOnly>
    </Box>
  );
}
