import { zodResolver } from "@hookform/resolvers/zod";
import { Autocomplete, Box, TextField, Typography } from "@mui/material";
import { useEffect } from "react";
import { Controller, useForm, type FieldPath } from "react-hook-form";

import FormDialog from "~/components/common/FormDialog";
import { COUNTRIES } from "~/lib/countries";
import { employeeFormSchema, localToday, type EmployeeFormValues } from "~/lib/employee-form";
import type { Department, FormError } from "~/lib/employees-api";

interface EmployeeFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  departments: Department[];
  defaultValues?: Partial<EmployeeFormValues>;
  submitting: boolean;
  serverError?: FormError | null;
  onClose: () => void;
  onSubmit: (values: EmployeeFormValues) => void;
}

const EMPTY: EmployeeFormValues = {
  employeeCode: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  departmentId: "",
  designation: "",
  country: "",
  joiningDate: "",
};

export default function EmployeeFormDialog({
  open,
  mode,
  departments,
  defaultValues,
  submitting,
  serverError,
  onClose,
  onSubmit,
}: EmployeeFormDialogProps) {
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: { ...EMPTY, ...defaultValues },
  });

  // Reopening must never show stale values. Declared before the serverError
  // effect so a field error set on mount is not wiped by the reset.
  useEffect(() => {
    if (open) reset({ ...EMPTY, ...defaultValues });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && serverError?.field) {
      setError(serverError.field, { type: "server", message: serverError.message });
    }
  }, [open, serverError, setError]);

  const text = (name: FieldPath<EmployeeFormValues>, label: string, extra: Record<string, unknown> = {}) => (
    <Controller
      name={name}
      control={control}
      render={({ field: { ref, ...field } }) => (
        <TextField
          {...field}
          inputRef={ref}
          id={`employee-${name}`}
          label={label}
          fullWidth
          error={!!errors[name]}
          helperText={errors[name]?.message}
          {...extra}
        />
      )}
    />
  );

  const countryField = (
    <Controller
      name="country"
      control={control}
      render={({ field: { ref, value, onChange, onBlur } }) => (
        <Autocomplete
          id="employee-country"
          options={COUNTRIES}
          getOptionLabel={(option) => option.name}
          isOptionEqualToValue={(option, selected) => option.code === selected.code}
          value={COUNTRIES.find((country) => country.code === value) ?? null}
          onChange={(_event, option) => onChange(option?.code ?? "")}
          onBlur={onBlur}
          autoHighlight
          renderInput={(params) => (
            <TextField
              {...params}
              inputRef={ref}
              label="Country"
              fullWidth
              error={!!errors.country}
              helperText={errors.country?.message}
            />
          )}
        />
      )}
    />
  );

  const select = (
    name: "departmentId",
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <Controller
      name={name}
      control={control}
      render={({ field: { ref, ...field } }) => (
        <TextField
          {...field}
          inputRef={ref}
          id={`employee-${name}`}
          select
          label={label}
          fullWidth
          error={!!errors[name]}
          helperText={errors[name]?.message}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
        >
          <option value="" />
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </TextField>
      )}
    />
  );

  return (
    <FormDialog
      open={open}
      title={mode === "create" ? "Add employee" : "Edit employee"}
      submitLabel={mode === "create" ? "Add employee" : "Save changes"}
      submitting={submitting}
      error={serverError && !serverError.field ? serverError.message : null}
      onClose={onClose}
      onSubmit={handleSubmit(onSubmit)}
      maxWidth="sm"
    >
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
        Basic
      </Typography>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, mb: 3 }}>
        {text("firstName", "First name")}
        {text("lastName", "Last name")}
        {text("email", "Work email", { type: "email" })}
        {text("phone", "Phone (optional)")}
      </Box>
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
        Job
      </Typography>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
        {text("employeeCode", "Employee ID", {
          disabled: mode === "edit",
          helperText: mode === "edit" ? "Cannot be changed" : errors.employeeCode?.message,
        })}
        {select(
          "departmentId",
          "Department",
          departments.map((department) => ({ value: department.id, label: department.name })),
        )}
        {text("designation", "Designation")}
        {countryField}
        {text("joiningDate", "Joining date", {
          type: "date",
          slotProps: { inputLabel: { shrink: true }, htmlInput: { max: localToday() } },
        })}
      </Box>
    </FormDialog>
  );
}
