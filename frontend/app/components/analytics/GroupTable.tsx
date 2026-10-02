import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";

import type { Basis, GroupBy, GroupRow } from "~/lib/analytics-api";
import { COUNTRIES } from "~/lib/countries";
import { formatMoney } from "~/lib/currencies";

export const GROUP_LABELS: Record<GroupBy, string> = { department: "Department", country: "Country", designation: "Role" };

interface Props {
  groups: GroupRow[];
  currency: string;
  groupBy: GroupBy;
  basis: Basis;
}

export default function GroupTable({ groups, currency, groupBy, basis }: Props) {
  const heading = `Groups by ${GROUP_LABELS[groupBy].toLowerCase()} (${currency}, ${basis})`;
  const name = (g: GroupRow) => (groupBy === "country" ? (COUNTRIES.find((c) => c.code === g.key)?.name ?? g.label) : g.label);
  return (
    <>
      <Typography id="group-table-heading" variant="subtitle2" component="h3" sx={{ mt: 1 }}>
        {heading}
      </Typography>
      <TableContainer>
        <Table size="small" aria-labelledby="group-table-heading">
          <TableHead>
            <TableRow>
              <TableCell>{GROUP_LABELS[groupBy]}</TableCell>
              <TableCell align="right">Employees</TableCell>
              <TableCell align="right">No salary</TableCell>
              <TableCell align="right">Salaried</TableCell>
              {["Average", "Median", "Min", "Max", "Total"].map((h) => (
                <TableCell key={h} align="right">
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {groups.map((g) => {
              const entry = g.currencies.find((c) => c.currency === currency);
              return (
                <TableRow key={g.key}>
                  <TableCell>{name(g)}</TableCell>
                  <TableCell align="right">{g.headcount}</TableCell>
                  <TableCell align="right">{g.withoutSalary}</TableCell>
                  {!entry ? (
                    <TableCell colSpan={6} align="center">
                      —
                    </TableCell>
                  ) : (
                    <>
                      <TableCell align="right">{entry.count}</TableCell>
                      {"suppressed" in entry ? (
                        <TableCell colSpan={5} align="center">
                          Fewer than 3 salaried employees
                        </TableCell>
                      ) : (
                        [entry.average, entry.median, entry.min, entry.max, entry.total].map((v, i) => (
                          <TableCell key={i} align="right">
                            {formatMoney(v, currency)}
                          </TableCell>
                        ))
                      )}
                    </>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}
