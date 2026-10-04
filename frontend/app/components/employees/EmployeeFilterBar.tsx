import { Badge, Box, Button, Popover, TextField, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { useEffect, useId, useRef, useState } from "react";

import { COUNTRIES } from "~/lib/countries";
import type { Department } from "~/lib/employees-api";
import { DEFAULT_SALARY_LIST_PARAMS, type SalaryListParams, type SalaryStatusFilter } from "~/lib/salary-directory-api";

export type EmployeeFilterValues = Pick<SalaryListParams, "q" | "status" | "departmentId" | "country" | "salary">;

interface EmployeeFilterBarProps {
  values: EmployeeFilterValues;
  departments: Department[];
  onChange: (patch: Partial<SalaryListParams>) => void;
  onClear: () => void;
}

const NATIVE_SELECT = { select: { native: true }, inputLabel: { shrink: true } } as const;

const popoverFilterCount = (values: EmployeeFilterValues) =>
  [values.departmentId, values.country, values.salary].filter(Boolean).length;

export function hasActiveFilters(values: EmployeeFilterValues) {
  return Boolean(values.q || popoverFilterCount(values) || values.status !== DEFAULT_SALARY_LIST_PARAMS.status);
}

export default function EmployeeFilterBar({ values, departments, onChange, onClear }: EmployeeFilterBarProps) {
  const [search, setSearch] = useState(values.q);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const panelId = useId();

  const lastEmitted = useRef(values.q);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Sync the box from the URL only for external changes (e.g. Clear filters),
  // not for the echo of a value this box emitted (which may be older than the typing).
  useEffect(() => {
    if (values.q === lastEmitted.current) return;
    lastEmitted.current = values.q;
    setSearch(values.q);
  }, [values.q]);

  useEffect(() => {
    // same normalisation as parseSalaryListParams, so the URL echo equals what we emitted
    const normalised = search.trim().slice(0, 100);
    if (normalised === lastEmitted.current) return;
    const timer = setTimeout(() => {
      lastEmitted.current = normalised;
      onChangeRef.current({ q: normalised });
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const count = popoverFilterCount(values);

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mb: 2, alignItems: "center" }}>
      <TextField
        id="employee-search"
        label="Search"
        placeholder="Name, email or employee ID"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        sx={{ minWidth: { xs: "100%", sm: 280 } }}
      />
      <ToggleButtonGroup
        exclusive
        size="small"
        aria-label="Status"
        value={values.status}
        onChange={(_event, status: SalaryStatusFilter | null) => {
          if (status) onChange({ status });
        }}
      >
        <ToggleButton value="ACTIVE">Active</ToggleButton>
        <ToggleButton value="INACTIVE">Inactive</ToggleButton>
        <ToggleButton value="ALL">All</ToggleButton>
      </ToggleButtonGroup>
      <Badge badgeContent={count} color="primary">
        <Button
          variant="outlined"
          color="inherit"
          aria-label={count ? `Filters (${count} active)` : "Filters"}
          aria-haspopup="dialog"
          aria-expanded={anchor !== null}
          aria-controls={anchor ? panelId : undefined}
          onClick={(event) => setAnchor(event.currentTarget)}
          sx={{ borderColor: "divider" }}
        >
          Filters
        </Button>
      </Badge>
      {hasActiveFilters(values) && (
        <Button onClick={onClear} size="small">
          Clear
        </Button>
      )}
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{
          paper: {
            id: panelId,
            role: "dialog",
            "aria-label": "Filters",
            sx: { p: 2, mt: 1, width: 280, display: "grid", gap: 2 },
          },
        }}
      >
        <TextField
          id="employee-filter-department"
          select
          label="Department"
          value={values.departmentId}
          onChange={(event) => onChange({ departmentId: event.target.value })}
          slotProps={NATIVE_SELECT}
        >
          <option value="">All</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </TextField>
        <TextField
          id="employee-filter-country"
          select
          label="Country"
          value={values.country}
          onChange={(event) => onChange({ country: event.target.value })}
          slotProps={NATIVE_SELECT}
        >
          <option value="">All</option>
          {COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </TextField>
        <TextField
          id="employee-filter-salary"
          select
          label="Salary"
          value={values.salary}
          onChange={(event) => onChange({ salary: event.target.value as EmployeeFilterValues["salary"] })}
          slotProps={NATIVE_SELECT}
        >
          <option value="">Any</option>
          <option value="with">Has salary</option>
          <option value="without">No salary</option>
        </TextField>
      </Popover>
    </Box>
  );
}
