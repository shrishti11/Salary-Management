import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Box, Button, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";

import ConfirmDialog from "~/components/common/ConfirmDialog";
import DateField from "~/components/common/DateField";
import FormDialog from "~/components/common/FormDialog";
import { CURRENCIES, formatMoney } from "~/lib/currencies";
import { formatDate } from "~/lib/format-date";
import {
  computeFormTotals,
  EXTRA_TYPES,
  MAX_EXTRAS,
  makeSalaryFormSchema,
  valuesFromSalary,
  type SalaryFormValues,
} from "~/lib/salary-form";
import type { Salary } from "~/lib/salaries-api";

interface SalaryFormDialogProps {
  open: boolean;
  mode: "initial" | "revise";
  current: Salary | null;
  minDate: string;
  submitting: boolean;
  serverError?: {
    message: string;
    field?: "effectiveDate" | "reason" | "baseAmount";
  } | null;
  onClose: () => void;
  onSubmit: (values: SalaryFormValues) => void;
}

const TYPE_LABELS: Record<(typeof EXTRA_TYPES)[number], string> = {
  ALLOWANCE: "Allowance",
  BONUS: "Bonus",
  DEDUCTION: "Deduction",
};

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Box component="section" aria-labelledby={id} sx={{ "& + &": { mt: 3 } }}>
      <Typography id={id} variant="subtitle2" component="h3" sx={{ mb: 1.5 }}>
        {title}
      </Typography>
      <Box sx={{ display: "grid", gap: 2 }}>{children}</Box>
    </Box>
  );
}

export default function SalaryFormDialog({
  open,
  mode,
  current,
  minDate,
  submitting,
  serverError,
  onClose,
  onSubmit,
}: SalaryFormDialogProps) {
  const schema = useMemo(() => makeSalaryFormSchema(mode), [mode]);
  const defaults = useMemo<SalaryFormValues>(
    () =>
      mode === "revise" && current
        ? valuesFromSalary(current)
        : {
            currency: current?.currency ?? "USD",
            effectiveDate: "",
            reason: "",
            baseAmount: "",
            extras: [],
          },
    [mode, current],
  );
  const [pending, setPending] = useState<SalaryFormValues | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm<SalaryFormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });
  const { fields, append, remove } = useFieldArray({ control, name: "extras" });

  useEffect(() => {
    if (open) {
      reset(defaults);
      setPending(null);
    }
  }, [open, defaults, reset]);

  useEffect(() => {
    if (open && serverError?.field) {
      setError(serverError.field, {
        type: "server",
        message: serverError.message,
      });
    }
  }, [open, serverError, setError]);

  const values = watch();
  const totals = computeFormTotals({
    baseAmount: values.baseAmount ?? "",
    extras: values.extras ?? [],
  });
  const money = (amount: string) =>
    formatMoney(amount, values.currency || "USD");

  const currencyChanged = mode === "revise" && !!current && !!values.currency && values.currency !== current.currency;

  const submit = handleSubmit((submitted) => {
    if (mode === "revise") setPending(submitted);
    else onSubmit(submitted);
  });

  const confirmMessage = pending
    ? `The new net salary will be ${
        computeFormTotals(pending)
          ? formatMoney(computeFormTotals(pending)!.net, pending.currency)
          : "—"
      } effective ${formatDate(pending.effectiveDate)}. The previous record is kept in history.${
        current && pending.currency !== current.currency
          ? ` Currency changes from ${current.currency} to ${pending.currency}; amounts are not converted.`
          : ""
      }`
    : "";

  const textField = (
    name: "effectiveDate" | "reason" | "baseAmount",
    id: string,
    label: string,
    extra: Record<string, unknown> = {},
  ) => {
    const Field = extra.type === "date" ? DateField : TextField;
    return (
    <Controller
      name={name}
      control={control}
      render={({ field: { ref, ...field } }) => (
        <Field
          {...field}
          inputRef={ref}
          id={id}
          label={label}
          fullWidth
          error={!!errors[name]}
          helperText={errors[name]?.message}
          {...extra}
        />
      )}
    />
  );
  };

  return (
    <>
      <FormDialog
        open={open}
        title={mode === "revise" ? "Revise salary" : "Set salary"}
        submitLabel="Save"
        submitting={submitting}
        error={serverError && !serverError.field ? serverError.message : null}
        onClose={onClose}
        onSubmit={submit}
        maxWidth="sm"
      >
        <Group id="salary-group-amount" title="Amount">
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            <Controller
              name="currency"
              control={control}
              render={({ field: { ref, ...field } }) => (
                <TextField
                  {...field}
                  inputRef={ref}
                  id="salary-currency"
                  select
                  label="Currency"
                  fullWidth
                  error={!!errors.currency}
                  helperText={errors.currency?.message}
                  slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
                >
                  <option value="" />
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </TextField>
              )}
            />
            {textField("baseAmount", "salary-baseAmount", "Base salary", {
              slotProps: { htmlInput: { inputMode: "decimal" } },
            })}
          </Box>

          {fields.map((item, index) => (
            <Box
              key={item.id}
              sx={{
                display: "grid",
                gap: 1,
                gridTemplateColumns: { xs: "1fr 1fr", sm: "9rem 1fr 8rem auto" },
                alignItems: "start",
              }}
            >
              <Controller
                name={`extras.${index}.type`}
                control={control}
                render={({ field: { ref, ...field } }) => (
                  <TextField
                    {...field}
                    inputRef={ref}
                    id={`salary-extra-${index}-type`}
                    select
                    label="Component type"
                    slotProps={{ select: { native: true } }}
                  >
                    {EXTRA_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABELS[t]}
                      </option>
                    ))}
                  </TextField>
                )}
              />
              <Controller
                name={`extras.${index}.name`}
                control={control}
                render={({ field: { ref, ...field } }) => (
                  <TextField
                    {...field}
                    inputRef={ref}
                    id={`salary-extra-${index}-name`}
                    label="Component name"
                    error={!!errors.extras?.[index]?.name}
                    helperText={errors.extras?.[index]?.name?.message}
                  />
                )}
              />
              <Controller
                name={`extras.${index}.amount`}
                control={control}
                render={({ field: { ref, ...field } }) => (
                  <TextField
                    {...field}
                    inputRef={ref}
                    id={`salary-extra-${index}-amount`}
                    label="Component amount"
                    error={!!errors.extras?.[index]?.amount}
                    helperText={errors.extras?.[index]?.amount?.message}
                    slotProps={{ htmlInput: { inputMode: "decimal" } }}
                  />
                )}
              />
              <Button onClick={() => remove(index)} disabled={submitting} color="inherit" sx={{ mt: 0.5 }}>
                Remove
              </Button>
            </Box>
          ))}

          <Box>
            <Button
              onClick={() => append({ type: "ALLOWANCE", name: "", amount: "" })}
              disabled={submitting || fields.length >= MAX_EXTRAS}
            >
              Add component
            </Button>
          </Box>

          {currencyChanged && (
            <Alert severity="warning">
              Currency changes from {current!.currency} to {values.currency}; amounts are not converted.
            </Alert>
          )}

          <Box
            data-testid="salary-totals"
            sx={{ display: "grid", gap: 0.5, p: 2, bgcolor: "action.hover", borderRadius: 1 }}
          >
            {(
              [
                ["Gross", totals?.gross],
                ["Deductions", totals?.deductions],
                ["Net", totals?.net],
              ] as const
            ).map(([label, amount]) => (
              <Box key={label} sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography component="span" sx={{ fontWeight: label === "Net" ? 600 : undefined }}>
                  {label}
                </Typography>
                <Typography
                  component="span"
                  sx={{ fontWeight: label === "Net" ? 600 : undefined, fontVariantNumeric: "tabular-nums" }}
                >
                  {amount ? money(amount) : "—"}
                </Typography>
              </Box>
            ))}
          </Box>
        </Group>

        <Group id="salary-group-when" title="When and why">
          {textField("effectiveDate", "salary-effectiveDate", "Effective date", {
            type: "date",
            slotProps: { inputLabel: { shrink: true }, htmlInput: { min: minDate } },
          })}
          {textField("reason", "salary-reason", "Reason", {
            multiline: true,
            minRows: 2,
            ...(mode === "initial" && { helperText: errors.reason?.message ?? "Optional" }),
          })}
        </Group>
      </FormDialog>

      <ConfirmDialog
        open={pending !== null}
        title="Save salary revision?"
        message={confirmMessage}
        confirmLabel="Save revision"
        loading={submitting}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) onSubmit(pending);
          setPending(null);
        }}
      />
    </>
  );
}
