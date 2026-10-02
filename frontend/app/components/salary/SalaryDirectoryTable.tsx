import {
  Chip,
  Link as MuiLink,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from "@mui/material";
import { Link } from "react-router";

import StatusChip from "~/components/common/StatusChip";
import { countryName } from "~/lib/countries";
import { formatMoney } from "~/lib/currencies";
import type { SortOrder } from "~/lib/employees-api";
import type { SalaryDirectoryRow, SalarySortField } from "~/lib/salary-directory-api";

const SORTABLE: { field: SalarySortField; label: string }[] = [
  { field: "name", label: "Employee" },
  { field: "employeeCode", label: "Employee ID" },
  { field: "department", label: "Department" },
  { field: "country", label: "Country" },
  { field: "effectiveDate", label: "Effective date" },
];

interface SalaryDirectoryTableProps {
  rows: SalaryDirectoryRow[];
  sortBy: SalarySortField;
  sortOrder: SortOrder;
  onSort: (field: SalarySortField) => void;
}

function SortHeader({ field, label, sortBy, sortOrder, onSort }: Omit<SalaryDirectoryTableProps, "rows"> & { field: SalarySortField; label: string }) {
  return (
    <TableCell sortDirection={sortBy === field ? sortOrder : false}>
      <TableSortLabel active={sortBy === field} direction={sortBy === field ? sortOrder : "asc"} onClick={() => onSort(field)}>
        {label}
      </TableSortLabel>
    </TableCell>
  );
}

const NoSalary = () => (
  <Typography component="span" variant="body2" color="text.secondary">
    No salary
  </Typography>
);

export default function SalaryDirectoryTable({ rows, sortBy, sortOrder, onSort }: SalaryDirectoryTableProps) {
  const header = { sortBy, sortOrder, onSort };
  const sortable = (field: SalarySortField) => (
    <SortHeader key={field} field={field} label={SORTABLE.find((c) => c.field === field)!.label} {...header} />
  );

  return (
    <TableContainer component={Paper} sx={{ overflowX: "auto" }}>
      <Table size="small" aria-label="Salaries">
        <TableHead>
          <TableRow>
            {sortable("name")}
            {sortable("employeeCode")}
            {sortable("department")}
            {sortable("country")}
            <TableCell>Currency</TableCell>
            <TableCell align="right">Gross</TableCell>
            <TableCell align="right">Net</TableCell>
            {sortable("effectiveDate")}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(({ employee, current, hasScheduled }) => (
            <TableRow key={employee.id} hover>
              <TableCell>
                <MuiLink component={Link} to={`/employees/${employee.id}`}>
                  {employee.firstName} {employee.lastName}
                </MuiLink>{" "}
                {employee.status === "INACTIVE" && <StatusChip status={employee.status} />}
              </TableCell>
              <TableCell>{employee.employeeCode}</TableCell>
              <TableCell>{employee.department.name}</TableCell>
              <TableCell>{countryName(employee.country)}</TableCell>
              {current ? (
                <>
                  <TableCell>{current.currency}</TableCell>
                  <TableCell align="right">{formatMoney(current.gross, current.currency)}</TableCell>
                  <TableCell align="right">{formatMoney(current.net, current.currency)}</TableCell>
                  <TableCell>
                    {current.effectiveDate}{" "}
                    {hasScheduled && <Chip size="small" color="info" variant="outlined" label="Scheduled" />}
                  </TableCell>
                </>
              ) : (
                <>
                  <TableCell>—</TableCell>
                  <TableCell align="right">
                    <NoSalary />
                  </TableCell>
                  <TableCell align="right">
                    <NoSalary />
                  </TableCell>
                  <TableCell>
                    {hasScheduled && <Chip size="small" color="info" variant="outlined" label="Scheduled" />}
                  </TableCell>
                </>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
