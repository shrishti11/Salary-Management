import { Alert, Box, Button, Chip, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";

import EmptyState from "~/components/common/EmptyState";
import Money from "~/components/common/Money";
import { formatMoney } from "~/lib/currencies";
import { formatDate } from "~/lib/format-date";
import type { ApiResult } from "~/lib/employees-api";
import type { Salary, SalaryComponentType, SalaryOverview } from "~/lib/salaries-api";

interface CompensationSectionProps {
  result: ApiResult<SalaryOverview>;
  employeeActive: boolean;
  /** Opens the set-salary dialog; offered from the empty state for active employees only. */
  onSetSalary?: () => void;
}

const GROUPS: { type: SalaryComponentType; label: string }[] = [
  { type: "BASE", label: "Base" },
  { type: "ALLOWANCE", label: "Allowances" },
  { type: "BONUS", label: "Bonuses" },
  { type: "DEDUCTION", label: "Deductions" },
];

const INACTIVE_NOTE = "Inactive employees cannot receive salary changes.";

function SalaryStatusChip({ status }: { status: Salary["status"] }) {
  if (status === "CURRENT") return <Chip size="small" color="success" variant="outlined" label="Current" />;
  if (status === "SCHEDULED") return <Chip size="small" color="info" variant="outlined" label="Scheduled" />;
  return <Chip size="small" variant="outlined" label="Previous" />;
}

function formatChange(change: Salary["changeFromPrevious"], currency: string) {
  if (!change) return "—";
  const negative = change.gross.startsWith("-");
  const amount = formatMoney(change.gross.replace(/^-/, ""), currency);
  const percent = change.grossPercent === null ? "" : ` (${change.grossPercent}%)`;
  return `${negative ? "-" : "+"}${amount}${percent}`;
}

function Total({ label, amount, currency, strong = false }: { label: string; amount: string; currency: string; strong?: boolean }) {
  return (
    <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: strong ? "primary.light" : "action.hover" }}>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography variant={strong ? "h6" : "body1"} component="div" sx={{ fontWeight: 600 }}>
        <Money amount={amount} currency={currency} />
      </Typography>
    </Box>
  );
}

function CurrentCard({ salary }: { salary: Salary }) {
  return (
    <Box data-testid="current-salary" sx={{ display: "grid", gap: 2 }}>
      <Box>
        <Typography variant="body2" color="text.secondary">
          {salary.currency} · Effective {formatDate(salary.effectiveDate)}
        </Typography>
        {salary.reason && <Typography>{salary.reason}</Typography>}
      </Box>
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" } }}>
        <Total label="Gross" amount={salary.totals.gross} currency={salary.currency} />
        <Total label="Deductions" amount={salary.totals.deductions} currency={salary.currency} />
        <Total label="Net" amount={salary.totals.net} currency={salary.currency} strong />
      </Box>
      <Table size="small" aria-label="Salary components">
        <TableBody>
          {GROUPS.map(({ type, label }) => {
            const rows = salary.components.filter((c) => c.type === type);
            if (rows.length === 0) return null;
            return [
              <TableRow key={`${type}-heading`}>
                <TableCell colSpan={2} sx={{ fontWeight: 600, color: "text.secondary" }}>
                  {label}
                </TableCell>
              </TableRow>,
              ...rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell align="right">
                    <Money amount={c.amount} currency={salary.currency} />
                  </TableCell>
                </TableRow>
              )),
            ];
          })}
        </TableBody>
      </Table>
    </Box>
  );
}

export default function CompensationSection({ result, employeeActive, onSetSalary }: CompensationSectionProps) {
  if (!result.ok) {
    if (result.status === 403) return null;
    return <Alert severity="error">Could not load compensation.</Alert>;
  }

  const { current, scheduled } = result.data;
  // Newest first, regardless of the order the API returned.
  const history = [...result.data.history].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));

  if (history.length === 0) {
    return (
      <Paper component="section">
        <EmptyState
          title="No salary recorded yet."
          description={employeeActive ? "Add the first salary record for this employee." : INACTIVE_NOTE}
          action={
            employeeActive && onSetSalary ? (
              <Button variant="contained" onClick={onSetSalary}>
                Set salary
              </Button>
            ) : undefined
          }
        />
      </Paper>
    );
  }

  return (
    <Box component="section" sx={{ display: "grid", gap: 2 }}>
      {!employeeActive && (
        <Typography variant="body2" color="text.secondary">
          {INACTIVE_NOTE}
        </Typography>
      )}

      {scheduled && (
        <Alert severity="info">
          Scheduled change effective {formatDate(scheduled.effectiveDate)}: net {formatMoney(scheduled.totals.net, scheduled.currency)}
        </Alert>
      )}

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
          Current salary
        </Typography>
        {current ? (
          <CurrentCard salary={current} />
        ) : (
          <Typography color="text.secondary">No current salary yet. Scheduled changes are listed below.</Typography>
        )}
      </Paper>

      <Paper sx={{ overflow: "hidden" }}>
        <Typography variant="h6" component="h2" sx={{ px: 3, pt: 2.5, pb: 1.5 }}>
          Salary history
        </Typography>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small" aria-label="Salary history">
            <TableHead>
              <TableRow>
                <TableCell>Effective date</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Gross</TableCell>
                <TableCell align="right">Net</TableCell>
                <TableCell>Change</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell>Changed by</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {history.map((salary) => (
                <TableRow key={salary.id}>
                  <TableCell>{formatDate(salary.effectiveDate)}</TableCell>
                  <TableCell>
                    <SalaryStatusChip status={salary.status} />
                  </TableCell>
                  <TableCell align="right">
                    <Money amount={salary.totals.gross} currency={salary.currency} />
                  </TableCell>
                  <TableCell align="right">
                    <Money amount={salary.totals.net} currency={salary.currency} />
                  </TableCell>
                  <TableCell>{formatChange(salary.changeFromPrevious, salary.currency)}</TableCell>
                  <TableCell>{salary.reason ?? "—"}</TableCell>
                  <TableCell>{salary.createdBy.name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Paper>
    </Box>
  );
}
