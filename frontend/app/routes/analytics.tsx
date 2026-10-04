import { Alert, Box, Button, LinearProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useEffect, useRef } from "react";
import { Link, useLoaderData, useNavigation, useSearchParams } from "react-router";

import AnalyticsFilters from "~/components/analytics/AnalyticsFilters";
import BarChartCard from "~/components/analytics/BarChartCard";
import ChartCard from "~/components/analytics/ChartCard";
import DistributionChart from "~/components/analytics/DistributionChart";
import GroupTable, { GROUP_LABELS } from "~/components/analytics/GroupTable";
import StatCards from "~/components/analytics/StatCards";
import TrendChart from "~/components/analytics/TrendChart";
import PageHeader from "~/components/layout/PageHeader";
import {
  DEFAULT_ANALYTICS_PARAMS,
  getAnalyticsDistribution,
  getAnalyticsFilters,
  getAnalyticsGroups,
  getAnalyticsSummary,
  getAnalyticsTrends,
  parseAnalyticsParams,
  toAnalyticsSearchParams,
  type AnalyticsParams,
  type GroupBy,
} from "~/lib/analytics-api";
import { COUNTRIES } from "~/lib/countries";
import { formatMoney } from "~/lib/currencies";
import type { Route } from "./+types/analytics";

export async function loader({ request }: Route.LoaderArgs) {
  const params = parseAnalyticsParams(new URL(request.url).searchParams);

  const [summary, filters] = await Promise.all([getAnalyticsSummary(request, params), getAnalyticsFilters(request)]);
  const currency = params.currency || (summary.ok ? (summary.data.currencies[0]?.currency ?? "") : "");
  const scoped = { ...params, currency };
  const [distribution, groups, trends] = await Promise.all([
    getAnalyticsDistribution(request, scoped),
    getAnalyticsGroups(request, scoped),
    getAnalyticsTrends(request, scoped),
  ]);

  return { params, currency, summary, distribution, groups, trends, filters };
}

export function ErrorBoundary() {
  return (
    <>
      <PageHeader title="Analytics" />
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" component={Link} to="/analytics">
            Try again
          </Button>
        }
      >
        Could not load analytics. Please try again.
      </Alert>
    </>
  );
}

const EMPTY = "No salary data for these filters";
const NO_OPTIONS = { departments: [], countries: [], designations: [], currencies: [] };
const countryName = (code: string) => COUNTRIES.find((c) => c.code === code)?.name ?? code;
const GRID = { display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }, "& > *": { minWidth: 0 }, mb: 2 } as const;

export default function Analytics() {
  const { params, currency, summary, distribution, groups, trends, filters } = useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();
  const navigation = useNavigation();

  // Apply changes to the latest requested state, not the render-time snapshot (rapid changes before a navigation commits).
  const latest = useRef(params);
  useEffect(() => {
    latest.current = params;
  }, [params]);

  const commit = (next: AnalyticsParams) => {
    latest.current = next;
    setSearchParams(toAnalyticsSearchParams(next));
  };
  const update = (patch: Partial<AnalyticsParams>) => commit({ ...latest.current, ...patch });
  const reset = () => {
    const { basis, groupBy } = latest.current;
    commit({ ...DEFAULT_ANALYTICS_PARAMS, basis, groupBy });
  };

  const loading = navigation.state === "loading";
  const { basis } = params;
  // Without a summary-derived currency (summary failed), fall back per panel to the first one that panel returned.
  const noData = currency === "" && summary.ok;
  const pick = (entries: { currency: string }[] | undefined) => currency || entries?.[0]?.currency || "";

  const distCurrency = distribution.ok ? pick(distribution.data.currencies) : currency;
  const distEntry = distribution.ok ? distribution.data.currencies.find((c) => c.currency === distCurrency) : undefined;
  const trendCurrency = trends.ok ? pick(trends.data.currencies) : currency;
  const trendEntry = trends.ok ? trends.data.currencies.find((c) => c.currency === trendCurrency) : undefined;
  const groupCurrency = groups.ok ? pick(groups.data.groups.flatMap((g) => g.currencies)) : currency;
  const groupBy: GroupBy = groups.ok ? groups.data.groupBy : params.groupBy;
  const activeMonths = trendEntry?.months.filter((m) => m.revisionCount > 0 || m.newSalaryCount > 0) ?? [];
  const barData = groups.ok
    ? groups.data.groups.flatMap((g) => {
        const entry = g.currencies.find((c) => c.currency === groupCurrency);
        if (!entry || "suppressed" in entry) return [];
        return [{ label: groupBy === "country" ? countryName(g.key) : g.label, value: Number(entry.average) }];
      })
    : [];

  const sub = (code: string, asOf?: string) => `${basis} · ${code || "no currency"}${asOf ? ` · as of ${asOf}` : ""}`;

  return (
    <>
      <PageHeader title="Analytics" subtitle="Company-wide compensation, per currency" />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Amounts are per period as entered. Currencies are never combined{currency ? `; showing ${currency}` : ""}.
      </Typography>

      {!filters.ok && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Could not load filter options.
        </Alert>
      )}
      <AnalyticsFilters
        params={params}
        effectiveCurrency={currency}
        options={filters.ok ? filters.data : NO_OPTIONS}
        onChange={update}
        onClear={reset}
      />
      {loading && <LinearProgress aria-label="Loading analytics" sx={{ mb: 1 }} />}

      <Box sx={{ opacity: loading ? 0.6 : 1 }}>
        <Box sx={{ mb: 2 }}>
          <ChartCard
            title="Compensation summary"
            subtitle={sub(currency, summary.ok ? summary.data.asOf : undefined)}
            result={summary}
            empty={summary.ok && (noData || !summary.data.currencies.some((c) => c.currency === currency)) ? EMPTY : undefined}
          >
            {summary.ok && <StatCards summary={summary.data} currency={currency} />}
          </ChartCard>
        </Box>

        <Box sx={GRID}>
          <ChartCard
            title="Salary distribution"
            subtitle={sub(distCurrency, distribution.ok ? distribution.data.asOf : undefined)}
            result={distribution}
            empty={distribution.ok && (noData || !distEntry) ? EMPTY : undefined}
          >
            {distEntry && <DistributionChart currency={distCurrency} buckets={distEntry.buckets} />}
          </ChartCard>

          <ChartCard
            title="Compare groups"
            subtitle={sub(groupCurrency, groups.ok ? groups.data.asOf : undefined)}
            result={groups}
            empty={groups.ok && (noData || groups.data.groups.length === 0) ? EMPTY : undefined}
          >
            <ToggleButtonGroup
              exclusive
              size="small"
              value={params.groupBy}
              onChange={(_e, value: GroupBy | null) => value && update({ groupBy: value })}
              aria-label="Group by"
              sx={{ mb: 1 }}
            >
              {(Object.keys(GROUP_LABELS) as GroupBy[]).map((key) => (
                <ToggleButton key={key} value={key} aria-label={`Compare by ${GROUP_LABELS[key]}`}>
                  {GROUP_LABELS[key]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            {groups.ok && (
              <>
                {barData.length > 0 && (
                  <BarChartCard
                    data={barData}
                    ariaLabel={`Average ${basis} salary by ${GROUP_LABELS[groupBy].toLowerCase()} in ${groupCurrency}`}
                    valueLabel={`Average (${groupCurrency})`}
                    formatValue={(v) => formatMoney(String(v), groupCurrency)}
                  />
                )}
                <GroupTable groups={groups.data.groups} currency={groupCurrency} groupBy={groupBy} basis={basis} />
              </>
            )}
          </ChartCard>
        </Box>

        <ChartCard
          title="Salary trends"
          subtitle={trends.ok ? `${sub(trendCurrency)} · ${trends.data.from} – ${trends.data.to}` : undefined}
          result={trends}
          empty={trends.ok && !trendEntry ? EMPTY : undefined}
        >
          {trendEntry && (
            <>
              <TrendChart currency={trendCurrency} months={trendEntry.months} />
              <TableContainer>
                <Table size="small" aria-label={`Monthly activity in ${trendCurrency}`}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Month</TableCell>
                      <TableCell align="right">Revisions</TableCell>
                      <TableCell align="right">New salaries</TableCell>
                      <TableCell align="right">Avg change %</TableCell>
                      <TableCell align="right">
                        Avg {basis} ({trendCurrency})
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {activeMonths.map((m) => {
                      const avg = basis === "net" ? m.avgNet : m.avgGross;
                      return (
                        <TableRow key={m.month}>
                          <TableCell>{m.month}</TableCell>
                          <TableCell align="right">{m.revisionCount}</TableCell>
                          <TableCell align="right">{m.newSalaryCount}</TableCell>
                          <TableCell align="right">{m.avgChangePercent === null ? "—" : `${m.avgChangePercent}%`}</TableCell>
                          <TableCell align="right">{avg === null ? "—" : formatMoney(avg, trendCurrency)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              {activeMonths.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  No salary changes in this period.
                </Typography>
              )}
            </>
          )}
        </ChartCard>
      </Box>
    </>
  );
}
