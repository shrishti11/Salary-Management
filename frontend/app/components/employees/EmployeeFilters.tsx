import { Box, Button, TextField } from "@mui/material";
import { useEffect, useRef, useState } from "react";

import { COUNTRIES } from "~/lib/countries";
import type { Department, ListParams } from "~/lib/employees-api";

type FilterValues = Pick<ListParams, "q" | "departmentId" | "country" | "status">;

interface EmployeeFiltersProps {
  values: FilterValues;
  departments: Department[];
  onChange: (patch: Partial<FilterValues>) => void;
  onClear: () => void;
}

const NATIVE_SELECT = { select: { native: true }, inputLabel: { shrink: true } } as const;

export default function EmployeeFilters({ values, departments, onChange, onClear }: EmployeeFiltersProps) {
  const [search, setSearch] = useState(values.q);

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
    // same normalisation as parseListParams, so the URL echo equals what we emitted
    const normalised = search.trim().slice(0, 100);
    if (normalised === lastEmitted.current) return;
    const timer = setTimeout(() => {
      lastEmitted.current = normalised;
      onChangeRef.current({ q: normalised });
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const hasFilters = Boolean(values.q || values.departmentId || values.country || values.status);

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2, alignItems: "center" }}>
      <TextField
        id="employee-search"
        label="Search"
        placeholder="Name, employee ID or email"
        size="small"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        sx={{ minWidth: { xs: "100%", sm: 280 } }}
      />
      <TextField
        id="employee-department"
        select
        label="Department"
        size="small"
        value={values.departmentId}
        onChange={(event) => onChange({ departmentId: event.target.value })}
        slotProps={NATIVE_SELECT}
        sx={{ minWidth: 160 }}
      >
        <option value="">All</option>
        {departments.map((department) => (
          <option key={department.id} value={department.id}>
            {department.name}
          </option>
        ))}
      </TextField>
      <TextField
        id="employee-country"
        select
        label="Country"
        size="small"
        value={values.country}
        onChange={(event) => onChange({ country: event.target.value })}
        slotProps={NATIVE_SELECT}
        sx={{ minWidth: 160 }}
      >
        <option value="">All</option>
        {COUNTRIES.map((country) => (
          <option key={country.code} value={country.code}>
            {country.name}
          </option>
        ))}
      </TextField>
      <TextField
        id="employee-status"
        select
        label="Status"
        size="small"
        value={values.status}
        onChange={(event) => onChange({ status: event.target.value as FilterValues["status"] })}
        slotProps={NATIVE_SELECT}
        sx={{ minWidth: 130 }}
      >
        <option value="">All</option>
        <option value="ACTIVE">Active</option>
        <option value="INACTIVE">Inactive</option>
      </TextField>
      {hasFilters && <Button onClick={onClear}>Clear filters</Button>}
    </Box>
  );
}
