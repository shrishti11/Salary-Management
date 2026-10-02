import { Box, Button, TextField } from "@mui/material";

import { hasActiveAnalyticsFilters, isRealDate, type AnalyticsParams, type FilterOptions } from "~/lib/analytics-api";
import { COUNTRIES } from "~/lib/countries";

interface Props {
  params: AnalyticsParams;
  /** The currency actually being shown; `params.currency` is empty when it was auto-picked. */
  effectiveCurrency: string;
  options: FilterOptions;
  onChange: (patch: Partial<AnalyticsParams>) => void;
  onClear: () => void;
}

const NATIVE_SELECT = { select: { native: true }, inputLabel: { shrink: true } } as const;
const DATE_FIELD = { inputLabel: { shrink: true } } as const;
const countryName = (code: string) => COUNTRIES.find((c) => c.code === code)?.name ?? code;

export default function AnalyticsFilters({ params, effectiveCurrency, options, onChange, onClear }: Props) {
  const currencies = effectiveCurrency && !options.currencies.includes(effectiveCurrency) ? [effectiveCurrency, ...options.currencies] : options.currencies;
  const designations = params.designation && !options.designations.includes(params.designation) ? [params.designation, ...options.designations] : options.designations;
  const date = (key: "asOf" | "from" | "to") => (value: string) => {
    if (value === "" || isRealDate(value)) onChange({ [key]: value });
  };
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2, alignItems: "center" }}>
      <TextField id="analytics-department" select label="Department" size="small" value={params.departmentId} onChange={(e) => onChange({ departmentId: e.target.value })} slotProps={NATIVE_SELECT} sx={{ minWidth: 160 }}>
        <option value="">All</option>
        {options.departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </TextField>
      <TextField id="analytics-country" select label="Country" size="small" value={params.country} onChange={(e) => onChange({ country: e.target.value })} slotProps={NATIVE_SELECT} sx={{ minWidth: 160 }}>
        <option value="">All</option>
        {options.countries.map((code) => (
          <option key={code} value={code}>
            {countryName(code)}
          </option>
        ))}
      </TextField>
      <TextField id="analytics-designation" select label="Role" size="small" value={params.designation} onChange={(e) => onChange({ designation: e.target.value })} slotProps={NATIVE_SELECT} sx={{ minWidth: 160 }}>
        <option value="">All</option>
        {designations.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </TextField>
      <TextField id="analytics-status" select label="Status" size="small" value={params.status} onChange={(e) => onChange({ status: e.target.value as AnalyticsParams["status"] })} slotProps={NATIVE_SELECT} sx={{ minWidth: 130 }}>
        <option value="ACTIVE">Active</option>
        <option value="INACTIVE">Inactive</option>
        <option value="ALL">All</option>
      </TextField>
      <TextField id="analytics-currency" select label="Currency" size="small" value={effectiveCurrency} onChange={(e) => onChange({ currency: e.target.value })} slotProps={NATIVE_SELECT} sx={{ minWidth: 110 }}>
        {effectiveCurrency === "" && <option value="">—</option>}
        {currencies.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </TextField>
      <TextField id="analytics-basis" select label="Basis" size="small" value={params.basis} onChange={(e) => onChange({ basis: e.target.value as AnalyticsParams["basis"] })} slotProps={NATIVE_SELECT} sx={{ minWidth: 110 }}>
        <option value="gross">Gross</option>
        <option value="net">Net</option>
      </TextField>
      <TextField id="analytics-as-of" type="date" label="As of" size="small" value={params.asOf} onChange={(e) => date("asOf")(e.target.value)} slotProps={DATE_FIELD} />
      <TextField id="analytics-from" type="date" label="From" size="small" value={params.from} onChange={(e) => date("from")(e.target.value)} slotProps={DATE_FIELD} />
      <TextField id="analytics-to" type="date" label="To" size="small" value={params.to} onChange={(e) => date("to")(e.target.value)} slotProps={{ ...DATE_FIELD, htmlInput: { max: today } }} />
      <Button onClick={onClear} disabled={!hasActiveAnalyticsFilters(params)}>
        Reset filters
      </Button>
    </Box>
  );
}
