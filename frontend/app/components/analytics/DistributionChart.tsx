import { Box, useTheme, Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatMoney } from "~/lib/currencies";
import ClientOnly from "./ClientOnly";

interface Props {
  currency: string;
  buckets: { from: string; to: string; count: number }[];
}

export default function DistributionChart({ currency, buckets }: Props) {
  const data = buckets.map((b) => ({ label: `${b.from}`, range: `${formatMoney(b.from, currency)} – ${formatMoney(b.to, currency)}`, count: b.count }));
  const theme = useTheme();
  return (
    <>
      <Box role="img" aria-label={`Salary distribution in ${currency}`} sx={{ height: 280 }}>
        <ClientOnly>
          {() => (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                <XAxis dataKey="label" tickFormatter={(v) => formatMoney(String(v), currency)} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} width={40} />
                <Tooltip labelFormatter={(_l, payload) => payload?.[0]?.payload?.range ?? ""} formatter={(v) => [String(v), "Employees"]} />
                <Bar dataKey="count" name="Employees" fill={theme.palette.primary.main} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ClientOnly>
      </Box>
      <Box sx={{ overflowX: "auto", mt: 1 }}>
        <Table size="small" aria-label={`Distribution buckets in ${currency}`}>
          <TableHead>
            <TableRow>
              <TableCell>Range ({currency})</TableCell>
              <TableCell align="right">Employees</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((d) => (
              <TableRow key={d.label}>
                <TableCell>{d.range}</TableCell>
                <TableCell align="right">{d.count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </>
  );
}
