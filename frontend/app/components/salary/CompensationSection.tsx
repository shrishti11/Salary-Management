import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import { formatMoney } from "~/lib/currencies";
import type { ApiResult } from "~/lib/employees-api";
import type {
  Salary,
  SalaryComponentType,
  SalaryOverview,
} from "~/lib/salaries-api";

interface CompensationSectionProps {
  result: ApiResult<SalaryOverview>;
  employeeActive: boolean;
  onSetSalary: () => void;
  onReviseSalary: () => void;
}

const GROUPS: { type: SalaryComponentType; label: string }[] = [
  { type: "BASE", label: "Base" },
  { type: "ALLOWANCE", label: "Allowances" },
  { type: "BONUS", label: "Bonuses" },
  { type: "DEDUCTION", label: "Deductions" },
];

const INACTIVE_NOTE = "Inactive employees cannot receive salary changes.";

function SalaryStatusChip({ status }: { status: Salary["status"] }) {
  if (status === "CURRENT")
    return <Chip size="small" color="success" label="Current" />;
  if (status === "SCHEDULED")
    return <Chip size="small" color="info" label="Scheduled" />;
  return <Chip size="small" variant="outlined" label="Previous" />;
}

function formatChange(change: Salary["changeFromPrevious"], currency: string) {
  if (!change) return "—";
  const negative = change.gross.startsWith("-");
  const amount = formatMoney(change.gross.replace(/^-/, ""), currency);
  const percent =
    change.grossPercent === null ? "" : ` (${change.grossPercent}%)`;
  return `${negative ? "-" : "+"}${amount}${percent}`;
}

function CurrentCard({ salary }: { salary: Salary }) {
  const money = (amount: string) => formatMoney(amount, salary.currency);
  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="current-salary">
      <Typography variant="subtitle2" color="text.secondary">
        {salary.currency} · Effective {salary.effectiveDate}
      </Typography>
      {salary.reason && <Typography sx={{ mb: 1 }}>{salary.reason}</Typography>}
      <Table size="small">
        <TableBody>
          {GROUPS.map(({ type, label }) => {
            const rows = salary.components.filter((c) => c.type === type);
            if (rows.length === 0) return null;
            return [
              <TableRow key={`${type}-heading`}>
                <TableCell colSpan={2} sx={{ fontWeight: 600 }}>
                  {label}
                </TableCell>
              </TableRow>,
              ...rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell align="right">{money(c.amount)}</TableCell>
                </TableRow>
              )),
            ];
          })}
          <TableRow>
            <TableCell sx={{ fontWeight: 600 }}>Gross</TableCell>
            <TableCell align="right">{money(salary.totals.gross)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ fontWeight: 600 }}>Deductions</TableCell>
            <TableCell align="right">
              {money(salary.totals.deductions)}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ fontWeight: 600 }}>Net</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600 }}>
              {money(salary.totals.net)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Paper>
  );
}

export default function CompensationSection({
  result,
  employeeActive,
  onSetSalary,
  onReviseSalary,
}: CompensationSectionProps) {
  if (!result.ok) {
    if (result.status === 403) return null;
    return <Alert severity="error">Could not load compensation.</Alert>;
  }

  const { current, scheduled, history } = result.data;

  if (history.length === 0) {
    return (
      <Box component="section">
        <Typography variant="h6" component="h2" gutterBottom>
          Compensation
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          No salary recorded yet.
        </Typography>
        {employeeActive ? (
          <Button variant="contained" onClick={onSetSalary}>
            Set salary
          </Button>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {INACTIVE_NOTE}
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <Box component="section" sx={{ display: "grid", gap: 2 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="h6" component="h2">
          Compensation
        </Typography>
        {employeeActive && (
          <Button variant="contained" onClick={onReviseSalary}>
            Revise salary
          </Button>
        )}
      </Box>

      {!employeeActive && (
        <Typography variant="body2" color="text.secondary">
          {INACTIVE_NOTE}
        </Typography>
      )}

      {current ? (
        <CurrentCard salary={current} />
      ) : (
        <Typography color="text.secondary">
          No current salary yet. Scheduled changes are listed below.
        </Typography>
      )}

      {scheduled && (
        <Alert severity="info">
          Scheduled change effective {scheduled.effectiveDate}: net{" "}
          {formatMoney(scheduled.totals.net, scheduled.currency)}
        </Alert>
      )}

      <Typography variant="subtitle1" component="h3">
        Salary history
      </Typography>
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
              <TableCell>{salary.effectiveDate}</TableCell>
              <TableCell>
                <SalaryStatusChip status={salary.status} />
              </TableCell>
              <TableCell align="right">
                {formatMoney(salary.totals.gross, salary.currency)}
              </TableCell>
              <TableCell align="right">
                {formatMoney(salary.totals.net, salary.currency)}
              </TableCell>
              <TableCell>
                {formatChange(salary.changeFromPrevious, salary.currency)}
              </TableCell>
              <TableCell>{salary.reason ?? "—"}</TableCell>
              <TableCell>{salary.createdBy.name}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
