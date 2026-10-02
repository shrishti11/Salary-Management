import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Box, Button, Paper, TextField } from "@mui/material";
import { useEffect } from "react";
import { Controller, useForm, type FieldPath } from "react-hook-form";
import { Link } from "react-router";

import { COUNTRIES } from "~/lib/countries";
import { employeeFormSchema, localToday, type EmployeeFormValues } from "~/lib/employee-form";
import type { Department, FormError } from "~/lib/employees-api";

interface EmployeeFormProps {
  mode: "create" | "edit";
  departments: Department[];
  defaultValues?: Partial<EmployeeFormValues>;
  submitting: boolean;
  serverError?: FormError | null;
  cancelHref: string;
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

export default function EmployeeForm({
  mode,
  departments,
  defaultValues,
  submitting,
  serverError,
  cancelHref,
  onSubmit,
}: EmployeeFormProps) {
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: { ...EMPTY, ...defaultValues },
  });

  useEffect(() => {
    if (serverError?.field) {
      setError(serverError.field, { type: "server", message: serverError.message });
    }
  }, [serverError, setError]);

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

  const select = (
    name: "departmentId" | "country",
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
    <Paper component="form" noValidate onSubmit={handleSubmit(onSubmit)} sx={{ p: 3, maxWidth: 720 }}>
      {serverError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {serverError.message}
        </Alert>
      )}

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
        {text("employeeCode", "Employee ID", { disabled: mode === "edit" })}
        <Box />
        {text("firstName", "First name")}
        {text("lastName", "Last name")}
        {text("email", "Email", { type: "email" })}
        {text("phone", "Phone")}
        {select(
          "departmentId",
          "Department",
          departments.map((department) => ({ value: department.id, label: department.name })),
        )}
        {text("designation", "Designation")}
        {select(
          "country",
          "Country",
          COUNTRIES.map((country) => ({ value: country.code, label: country.name })),
        )}
        {text("joiningDate", "Joining date", {
          type: "date",
          slotProps: { inputLabel: { shrink: true }, htmlInput: { max: localToday() } },
        })}
      </Box>

      <Box sx={{ display: "flex", gap: 2, mt: 3 }}>
        <Button type="submit" variant="contained" disabled={submitting}>
          {submitting ? "Saving…" : "Save employee"}
        </Button>
        <Button component={Link} to={cancelHref} disabled={submitting}>
          Cancel
        </Button>
      </Box>
    </Paper>
  );
}
