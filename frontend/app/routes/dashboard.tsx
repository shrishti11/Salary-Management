import { Alert, Box, Button, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { Link, useLoaderData, useRouteLoaderData } from "react-router";

import BarChartCard from "~/components/analytics/BarChartCard";
import ChartCard from "~/components/analytics/ChartCard";
import MetricCard from "~/components/analytics/MetricCard";
import MoneyList from "~/components/analytics/MoneyList";
import RecentActivity from "~/components/analytics/RecentActivity";
import PageHeader from "~/components/layout/PageHeader";
import { getDashboard } from "~/lib/analytics-api";
import { COUNTRIES } from "~/lib/countries";
import { formatMoney } from "~/lib/currencies";
import { AUTHENTICATED_ROUTE_ID } from "~/lib/route-ids";
import type { loader as authenticatedLoader } from "./authenticated";
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

const countryName = (code: string) => COUNTRIES.find((c) => c.code === code)?.name ?? code;
const GROUP_SUBTITLE = "Active employees; each currency shown separately";

export default function Dashboard() {
  const auth = useRouteLoaderData<typeof authenticatedLoader>(AUTHENTICATED_ROUTE_ID);

  if (!auth) {
    throw new Error("Dashboard must render inside the authenticated layout route");
  }

  const { asOf, metrics, departments, countries, recentEmployees, recentRevisions } = useLoaderData<typeof loader>();

  return (
    <>
      <PageHeader title="Dashboard" />
      <p>
        Signed in as {auth.user.name} ({auth.user.role}).
      </p>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(5, 1fr)" }, mb: 2 }}>
        <MetricCard label="Total employees" value={String(metrics.totalEmployees)} />
        <MetricCard label="Active employees" value={String(metrics.activeEmployees)} />
        <MetricCard label="Departments" value={String(metrics.departmentCount)} />
        <MetricCard label="Countries" value={String(metrics.countryCount)} />
        <MetricCard label="Without salary" value={String(metrics.withoutSalary)} hint="No current salary" />
      </Box>

      <Box sx={{ mb: 2 }}>
        <ChartCard
          title="Salary overview"
          subtitle={`Active employees · gross per period · as of ${asOf}`}
          empty={metrics.currencies.length === 0 ? "No salary data yet" : undefined}
        >
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(auto-fit, minmax(220px, 1fr))" } }}>
            {metrics.currencies.map((c) => (
              <Paper key={c.currency} variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" component="h3">
                  <strong>{c.currency}</strong>
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {c.count} employees
                </Typography>
                <Typography variant="body2">Total {formatMoney(c.total, c.currency)}</Typography>
                <Typography variant="body2">Average {formatMoney(c.average, c.currency)}</Typography>
                <Typography variant="body2">Median {formatMoney(c.median, c.currency)}</Typography>
              </Paper>
            ))}
          </Box>
        </ChartCard>
      </Box>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, mb: 2 }}>
        <ChartCard title="By department" subtitle={GROUP_SUBTITLE} empty={departments.length === 0 ? "No departments yet" : undefined}>
          <BarChartCard
            ariaLabel="Headcount by department"
            valueLabel="Employees"
            data={departments.map((d) => ({ label: d.name, value: d.headcount }))}
          />
          <Table size="small" aria-label="Departments">
            <TableHead>
              <TableRow>
                <TableCell>Department</TableCell>
                <TableCell>Employees</TableCell>
                <TableCell>Salary</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {departments.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{d.name}</TableCell>
                  <TableCell>{d.headcount}</TableCell>
                  <TableCell>
                    <MoneyList lines={d.currencies} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ChartCard>
        <ChartCard title="By country" subtitle={GROUP_SUBTITLE} empty={countries.length === 0 ? "No countries yet" : undefined}>
          <BarChartCard
            ariaLabel="Headcount by country"
            valueLabel="Employees"
            data={countries.map((c) => ({ label: countryName(c.country), value: c.headcount }))}
          />
          <Table size="small" aria-label="Countries">
            <TableHead>
              <TableRow>
                <TableCell>Country</TableCell>
                <TableCell>Employees</TableCell>
                <TableCell>Salary</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {countries.map((c) => (
                <TableRow key={c.country}>
                  <TableCell>{countryName(c.country)}</TableCell>
                  <TableCell>{c.headcount}</TableCell>
                  <TableCell>
                    <MoneyList lines={c.currencies} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ChartCard>
      </Box>

      <RecentActivity recentEmployees={recentEmployees} recentRevisions={recentRevisions} />

      <Box sx={{ mt: 2 }}>
        <Button variant="contained" component={Link} to="/analytics">
          Open salary analytics
        </Button>
      </Box>
    </>
  );
}
