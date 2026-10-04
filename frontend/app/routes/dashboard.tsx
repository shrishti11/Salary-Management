import { Alert, Box, Button, Link as MuiLink, Paper, Typography } from "@mui/material";
import { Link, useFetcher, useLoaderData, useRouteLoaderData } from "react-router";

import AboutCard from "~/components/dashboard/AboutCard";
import DemoDataCard from "~/components/dashboard/DemoDataCard";
import { useToast } from "~/components/common/ToastProvider";
import MetricCard from "~/components/analytics/MetricCard";
import RecentActivity from "~/components/analytics/RecentActivity";
import PageHeader from "~/components/layout/PageHeader";
import { getDashboard } from "~/lib/analytics-api";
import { getDemoDataStatus, reseedDemoData, seedDemoData } from "~/lib/demo-data-api";
import { formatDate } from "~/lib/format-date";
import { AUTHENTICATED_ROUTE_ID } from "~/lib/route-ids";
import { useFetcherResult } from "~/lib/use-fetcher-result";
import type { Route } from "./+types/dashboard";

export async function loader({ request }: Route.LoaderArgs) {
  const [result, demo] = await Promise.all([getDashboard(request), getDemoDataStatus(request)]);
  if (!result.ok) throw new Response(result.message, { status: result.status });
  // The demo-data card is a convenience; if its status cannot be read the dashboard still works.
  return { ...result.data, demo: demo.ok ? demo.data : null };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const reseed = form.get("intent") === "reseed";
  const result = await (reseed ? reseedDemoData(request) : seedDemoData(request));
  if (!result.ok) return { error: result.message };
  const { created, count } = result.data;
  const loaded = `${count.toLocaleString("en-US")} demo employees`;
  return { message: !created ? "Demo data is already loaded" : reseed ? `Reseeded ${loaded}` : `Loaded ${loaded}` };
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
  const { asOf, metrics, recentEmployees, recentRevisions, demo } = useLoaderData<typeof loader>();
  const role = (useRouteLoaderData(AUTHENTICATED_ROUTE_ID) as { user?: { role?: string } } | undefined)?.user?.role;
  const toast = useToast();
  const seedFetcher = useFetcher<typeof action>();
  useFetcherResult(seedFetcher, (data) => {
    if ("error" in data) toast.error(String(data.error));
    else toast.success(String(data.message));
  });
  const seeding = seedFetcher.state !== "idle";

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`As of ${formatDate(asOf)}`} />
      <AboutCard />
      {demo && role === "ADMIN" && (
        <DemoDataCard
          status={demo}
          seeding={seeding}
          onSeed={() => seedFetcher.submit({ intent: "seed" }, { method: "post" })}
          onReseed={() => seedFetcher.submit({ intent: "reseed" }, { method: "post" })}
        />
      )}
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
