import { Box, Chip, Link as MuiLink, List, ListItem, ListItemText, Paper, Typography } from "@mui/material";
import { Link } from "react-router";

import type { DashboardData } from "~/lib/analytics-api";
import { formatMoney } from "~/lib/currencies";

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

function Section({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="subtitle1" component="h2" sx={{ mb: 1 }}>
        {title}
      </Typography>
      {empty ? (
        <Typography variant="body2" color="text.secondary">
          {EMPTY}
        </Typography>
      ) : (
        <List dense disablePadding sx={{ overflowWrap: "anywhere" }}>
          {children}
        </List>
      )}
    </Box>
  );
}

export default function RecentActivity({ recentEmployees, recentRevisions }: Props) {
  return (
    <Paper variant="outlined" sx={{ p: 2, display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      <Section title="Recent hires" empty={recentEmployees.length === 0}>
        {recentEmployees.map((e) => (
          <ListItem key={e.id} disableGutters>
            <ListItemText
              primary={<EmployeeLink id={e.id} name={e.name} />}
              secondary={`${e.employeeCode} · ${e.department} · joined ${e.joiningDate}`}
            />
          </ListItem>
        ))}
      </Section>
      <Section title="Recent salary changes" empty={recentRevisions.length === 0}>
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
      </Section>
    </Paper>
  );
}
