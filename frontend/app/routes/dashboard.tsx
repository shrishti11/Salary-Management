import { Alert, Box, Button, Link as MuiLink, Paper, Typography } from "@mui/material";
import { Link, useLoaderData } from "react-router";

import MetricCard from "~/components/analytics/MetricCard";
import RecentActivity from "~/components/analytics/RecentActivity";
import PageHeader from "~/components/layout/PageHeader";
import { getDashboard } from "~/lib/analytics-api";
import type { Route } from "./+types/dashboard";

export async function loader({ request }: Route.LoaderArgs) {
  const result = await getDashboard(request);
  if (!result.ok) throw new Response(result.message, { status: result.status });
  return result.data;
}

export function ErrorBoundary() {
  return (
    <>
      <PageHeader title="Dashboard" />
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" component={Link} to="/dashboard">
            Try again
          </Button>
        }
      >
        Could not load the dashboard. Please try again.
      </Alert>
    </>
  );
}

export default function Dashboard() {
  const { asOf, metrics, recentEmployees, recentRevisions } = useLoaderData<typeof loader>();

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`As of ${asOf}`} />
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(4, 1fr)" }, mb: 2 }}>
        <MetricCard label="Active employees" value={String(metrics.activeEmployees)} />
        <MetricCard label="Departments" value={String(metrics.departmentCount)} />
        <MetricCard label="Countries" value={String(metrics.countryCount)} />
        <MetricCard label="Without salary" value={String(metrics.withoutSalary)} hint="No current salary" />
      </Box>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }, alignItems: "start", "& > *": { minWidth: 0 } }}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" component="h2" sx={{ mb: 1 }}>
            Attention
          </Typography>
          {metrics.withoutSalary > 0 ? (
            <MuiLink component={Link} to="/employees?salary=without">
              {metrics.withoutSalary} {metrics.withoutSalary === 1 ? "employee has" : "employees have"} no salary
            </MuiLink>
          ) : (
            <Typography color="text.secondary">Nothing needs your attention.</Typography>
          )}
        </Paper>
        <RecentActivity recentEmployees={recentEmployees} recentRevisions={recentRevisions} />
      </Box>
    </>
  );
}
