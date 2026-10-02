import { Box, Chip, Link as MuiLink, List, ListItem, ListItemText } from "@mui/material";
import { Link } from "react-router";

import type { DashboardData } from "~/lib/analytics-api";
import { formatMoney } from "~/lib/currencies";
import ChartCard from "./ChartCard";

type Props = Pick<DashboardData, "recentEmployees" | "recentRevisions">;

const EMPTY = "No recent activity";

function EmployeeLink({ id, name }: { id: string; name: string }) {
  return (
    <MuiLink component={Link} to={`/employees/${id}`}>
      {name}
    </MuiLink>
  );
}

function change(percent: string | null) {
  if (percent === null) return <Chip size="small" label="new currency" />;
  const negative = percent.startsWith("-");
  return <Chip size="small" color={negative ? "error" : "success"} label={`${negative ? "" : "+"}${percent}%`} />;
}

export default function RecentActivity({ recentEmployees, recentRevisions }: Props) {
  return (
    <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
      <ChartCard title="Recent employees" empty={recentEmployees.length === 0 ? EMPTY : undefined}>
        <List dense disablePadding>
          {recentEmployees.map((e) => (
            <ListItem key={e.id} disableGutters>
              <ListItemText
                primary={<EmployeeLink id={e.id} name={e.name} />}
                secondary={`${e.employeeCode} · ${e.department} · joined ${e.joiningDate}`}
              />
            </ListItem>
          ))}
        </List>
      </ChartCard>
      <ChartCard title="Recent salary revisions" empty={recentRevisions.length === 0 ? EMPTY : undefined}>
        <List dense disablePadding>
          {recentRevisions.map((r) => (
            <ListItem key={r.id} disableGutters>
              <ListItemText
                primary={
                  <>
                    <EmployeeLink id={r.employee.id} name={r.employee.name} /> {change(r.changePercent)}
                  </>
                }
                secondary={`${formatMoney(r.gross, r.currency)} · effective ${r.effectiveDate} · ${r.reason} · by ${r.createdBy.name}`}
                slotProps={{ primary: { component: "div" }, secondary: { component: "div" } }}
              />
            </ListItem>
          ))}
        </List>
      </ChartCard>
    </Box>
  );
}
