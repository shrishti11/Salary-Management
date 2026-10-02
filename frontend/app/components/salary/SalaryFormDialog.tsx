import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";

import ConfirmDialog from "~/components/common/ConfirmDialog";
import { CURRENCIES, formatMoney } from "~/lib/currencies";
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

  const submit = handleSubmit((submitted) => {
    if (mode === "revise") setPending(submitted);
    else onSubmit(submitted);
  });

  const confirmMessage = pending
    ? `The new net salary will be ${
        computeFormTotals(pending)
          ? formatMoney(computeFormTotals(pending)!.net, pending.currency)
          : "—"
      } effective ${pending.effectiveDate}. The previous record is kept in history.${
        current && pending.currency !== current.currency
          ? ` Currency changes from ${current.currency} to ${pending.currency}; amounts are not converted.`
          : ""
      }`
    : "";

  return (
    <>
      <Dialog
        open={open}
        onClose={submitting ? undefined : onClose}
        fullWidth
        maxWidth="sm"
        aria-labelledby="salary-dialog-title"
      >
        <form noValidate onSubmit={submit}>
          <DialogTitle id="salary-dialog-title">
            {mode === "revise" ? "Revise salary" : "Set salary"}
          </DialogTitle>
          <DialogContent>
            <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
              {serverError && !serverError.field && (
                <Alert severity="error">{serverError.message}</Alert>
              )}

              <Box
                sx={{
                  display: "grid",
                  gap: 2,
                  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                }}
              >
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
                      slotProps={{
                        select: { native: true },
                        inputLabel: { shrink: true },
                      }}
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
                <Controller
                  name="effectiveDate"
                  control={control}
                  render={({ field: { ref, ...field } }) => (
                    <TextField
                      {...field}
                      inputRef={ref}
                      id="salary-effectiveDate"
                      type="date"
                      label="Effective date"
                      fullWidth
                      error={!!errors.effectiveDate}
                      helperText={errors.effectiveDate?.message}
                      slotProps={{
                        inputLabel: { shrink: true },
                        htmlInput: { min: minDate },
                      }}
                    />
                  )}
                />
              </Box>

              <Controller
                name="reason"
                control={control}
                render={({ field: { ref, ...field } }) => (
                  <TextField
                    {...field}
                    inputRef={ref}
                    id="salary-reason"
                    label="Reason"
                    multiline
                    minRows={2}
                    fullWidth
                    error={!!errors.reason}
                    helperText={errors.reason?.message}
                  />
                )}
              />

              <Controller
                name="baseAmount"
                control={control}
                render={({ field: { ref, ...field } }) => (
                  <TextField
                    {...field}
                    inputRef={ref}
                    id="salary-baseAmount"
                    label="Base salary"
                    fullWidth
                    error={!!errors.baseAmount}
                    helperText={errors.baseAmount?.message}
                    slotProps={{ htmlInput: { inputMode: "decimal" } }}
                  />
                )}
              />

              {fields.map((item, index) => (
                <Box
                  key={item.id}
                  sx={{
                    display: "grid",
                    gap: 1,
                    gridTemplateColumns: {
                      xs: "1fr 1fr",
                      sm: "9rem 1fr 8rem auto",
                    },
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
                  <Button
                    onClick={() => remove(index)}
                    disabled={submitting}
                    sx={{ mt: 1 }}
                  >
                    Remove
                  </Button>
                </Box>
              ))}

              <Box>
                <Button
                  onClick={() =>
                    append({ type: "ALLOWANCE", name: "", amount: "" })
                  }
                  disabled={submitting || fields.length >= MAX_EXTRAS}
                >
                  Add component
                </Button>
              </Box>

              <Box
                data-testid="salary-totals"
                sx={{
                  display: "grid",
                  gap: 0.5,
                  p: 2,
                  bgcolor: "action.hover",
                  borderRadius: 1,
                }}
              >
                {(
                  [
                    ["Gross", totals?.gross],
                    ["Deductions", totals?.deductions],
                    ["Net", totals?.net],
                  ] as const
                ).map(([label, amount]) => (
                  <Box
                    key={label}
                    sx={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <Typography
                      component="span"
                      sx={{ fontWeight: label === "Net" ? 600 : undefined }}
                    >
                      {label}
                    </Typography>
                    <Typography
                      component="span"
                      sx={{ fontWeight: label === "Net" ? 600 : undefined }}
                    >
                      {amount ? money(amount) : "—"}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

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
