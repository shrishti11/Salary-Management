import {
  Box,
  Chip,
  IconButton,
  Link as MuiLink,
  Menu,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from "@mui/material";
import { useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router";

import Money from "~/components/common/Money";
import StatusChip from "~/components/common/StatusChip";
import { countryName } from "~/lib/countries";
import type { SortOrder } from "~/lib/employees-api";
import type { SalaryDirectoryRow, SalarySortField } from "~/lib/salary-directory-api";

export type EmployeeRowAction = "deactivate" | "reactivate";

interface EmployeeDirectoryTableProps {
  rows: SalaryDirectoryRow[];
  sortBy: SalarySortField;
  sortOrder: SortOrder;
  onSort: (field: SalarySortField) => void;
  onAction: (action: EmployeeRowAction, row: SalaryDirectoryRow) => void;
}

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });
const formatDate = (value: string) => dateFormat.format(new Date(`${value.slice(0, 10)}T00:00:00Z`));

const stop = (event: MouseEvent) => event.stopPropagation();

function SortHeader({
  field,
  label,
  sortBy,
  sortOrder,
  onSort,
}: Pick<EmployeeDirectoryTableProps, "sortBy" | "sortOrder" | "onSort"> & { field: SalarySortField; label: string }) {
  const active = sortBy === field;
  return (
    <TableCell sortDirection={active ? sortOrder : false}>
      <TableSortLabel active={active} direction={active ? sortOrder : "asc"} onClick={() => onSort(field)}>
        {label}
      </TableSortLabel>
    </TableCell>
  );
}

function RowMenu({ row, onAction }: { row: SalaryDirectoryRow; onAction: EmployeeDirectoryTableProps["onAction"] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { employee, current } = row;
  const name = `${employee.firstName} ${employee.lastName}`;
  const profile = `/employees/${employee.id}`;
  const close = () => setAnchor(null);
  const act = (action: EmployeeRowAction) => {
    close();
    onAction(action, row);
  };
  const menuId = `employee-actions-${employee.id}`;

  return (
    <>
      <IconButton
        size="small"
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        aria-controls={anchor ? menuId : undefined}
        aria-expanded={anchor !== null}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <Box component="span" aria-hidden sx={{ fontSize: 18, lineHeight: 1, px: 0.25 }}>
          ⋯
        </Box>
      </IconButton>
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={anchor !== null}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <MenuItem component={Link} to={profile}>
          View
        </MenuItem>
        <MenuItem component={Link} to={`${profile}?edit=1`}>
          Edit
        </MenuItem>
        {employee.status === "ACTIVE" && (
          <MenuItem component={Link} to={`${profile}?salary=${current ? "revise" : "initial"}`}>
            {current ? "Revise salary" : "Set salary"}
          </MenuItem>
        )}
        {employee.status === "ACTIVE" ? (
          <MenuItem onClick={() => act("deactivate")} sx={{ color: "error.main" }}>
            Deactivate
          </MenuItem>
        ) : (
          <MenuItem onClick={() => act("reactivate")}>Reactivate</MenuItem>
        )}
      </Menu>
    </>
  );
}

export default function EmployeeDirectoryTable({ rows, sortBy, sortOrder, onSort, onAction }: EmployeeDirectoryTableProps) {
  const navigate = useNavigate();
  const header = { sortBy, sortOrder, onSort };

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table size="small" aria-label="Employees">
        <TableHead>
          <TableRow>
            <SortHeader field="name" label="Name" {...header} />
            <SortHeader field="department" label="Department" {...header} />
            <SortHeader field="country" label="Country" {...header} />
            <SortHeader field="joiningDate" label="Joined" {...header} />
            <TableCell align="right">Current salary</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">
              <Box component="span" sx={visuallyHidden}>
                Actions
              </Box>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const { employee, current, hasScheduled } = row;
            const profile = `/employees/${employee.id}`;
            return (
              <TableRow key={employee.id} hover onClick={() => navigate(profile)} sx={{ cursor: "pointer" }}>
                <TableCell>
                  <MuiLink component={Link} to={profile} underline="hover" onClick={stop} sx={{ fontWeight: 600 }}>
                    {employee.firstName} {employee.lastName}
                  </MuiLink>
                  <Typography variant="caption" color="text.secondary" component="div">
                    {employee.email} · {employee.employeeCode}
                  </Typography>
                </TableCell>
                <TableCell>
                  {employee.department.name}
                  <Typography variant="caption" color="text.secondary" component="div">
                    {employee.designation}
                  </Typography>
                </TableCell>
                <TableCell>{countryName(employee.country)}</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDate(employee.joiningDate)}</TableCell>
                <TableCell align="right">
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {current ? (
                      <Money amount={current.gross} currency={current.currency} />
                    ) : (
                      <Chip size="small" label="No salary" variant="outlined" />
                    )}
                    {hasScheduled && <Chip size="small" color="warning" variant="outlined" label="Revision scheduled" />}
                  </Box>
                </TableCell>
                <TableCell>
                  <StatusChip status={employee.status} />
                </TableCell>
                {/* Menu clicks (including the portalled menu) must not open the profile. */}
                <TableCell align="right" onClick={stop}>
                  <RowMenu row={row} onAction={onAction} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

const visuallyHidden = {
  border: 0,
  clip: "rect(0 0 0 0)",
  height: "1px",
  margin: "-1px",
  overflow: "hidden",
  padding: 0,
  position: "absolute",
  whiteSpace: "nowrap",
  width: "1px",
} as const;
