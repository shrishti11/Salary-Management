import { Link as MuiLink, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel } from "@mui/material";
import { Link } from "react-router";

import StatusChip from "~/components/common/StatusChip";
import { countryName } from "~/lib/countries";
import type { Employee, SortField, SortOrder } from "~/lib/employees-api";

const COLUMNS: { field: SortField; label: string }[] = [
  { field: "employeeCode", label: "Employee ID" },
  { field: "name", label: "Name" },
  { field: "department", label: "Department" },
  { field: "designation", label: "Designation" },
  { field: "country", label: "Country" },
  { field: "joiningDate", label: "Joined" },
  { field: "status", label: "Status" },
];

interface EmployeeTableProps {
  employees: Employee[];
  sortBy: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
}

export default function EmployeeTable({ employees, sortBy, sortOrder, onSort }: EmployeeTableProps) {
  return (
    <TableContainer component={Paper} sx={{ overflowX: "auto" }}>
      <Table size="small" aria-label="Employees">
        <TableHead>
          <TableRow>
            {COLUMNS.map((column) => (
              <TableCell key={column.field} sortDirection={sortBy === column.field ? sortOrder : false}>
                <TableSortLabel
                  active={sortBy === column.field}
                  direction={sortBy === column.field ? sortOrder : "asc"}
                  onClick={() => onSort(column.field)}
                >
                  {column.label}
                </TableSortLabel>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {employees.map((employee) => (
            <TableRow key={employee.id} hover>
              <TableCell>{employee.employeeCode}</TableCell>
              <TableCell>
                <MuiLink component={Link} to={`/employees/${employee.id}`}>
                  {employee.firstName} {employee.lastName}
                </MuiLink>
              </TableCell>
              <TableCell>{employee.department.name}</TableCell>
              <TableCell>{employee.designation}</TableCell>
              <TableCell>{countryName(employee.country)}</TableCell>
              <TableCell>{employee.joiningDate}</TableCell>
              <TableCell>
                <StatusChip status={employee.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
