import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import type { FormEventHandler, ReactNode } from "react";

interface FormDialogProps {
  open: boolean;
  title: string;
  submitLabel: string;
  submitting?: boolean;
  error?: string | null;
  maxWidth?: "xs" | "sm" | "md";
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
}

export default function FormDialog({ open, title, submitLabel, submitting = false, error, maxWidth = "sm", onClose, onSubmit, children }: FormDialogProps) {
  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth={maxWidth} aria-labelledby="form-dialog-title">
      <form noValidate onSubmit={onSubmit}>
        <DialogTitle id="form-dialog-title">{title}</DialogTitle>
        <DialogContent dividers>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {children}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={submitting}>{submitting ? "Saving…" : submitLabel}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
