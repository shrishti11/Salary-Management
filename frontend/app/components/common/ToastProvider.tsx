import { Alert, Button, Snackbar, type SnackbarCloseReason } from "@mui/material";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";

interface ToastAction { label: string; to: string }
type Toast = { severity: "success" | "error"; text: string; action?: ToastAction };
interface ToastApi {
  success(text: string, action?: ToastAction): void;
  error(text: string): void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  // The last toast stays in state after closing so the Snackbar exit transition
  // still renders its content; `open` alone drives visibility. `key` remounts the
  // Snackbar for each new toast so a replacement restarts the auto-hide timer.
  const [toast, setToast] = useState<(Toast & { key: number }) | null>(null);
  const [open, setOpen] = useState(false);
  const show = useCallback((next: Toast) => {
    setToast((prev) => ({ ...next, key: (prev?.key ?? 0) + 1 }));
    setOpen(true);
  }, []);
  const success = useCallback((text: string, action?: ToastAction) => show({ severity: "success", text, action }), [show]);
  const error = useCallback((text: string) => show({ severity: "error", text }), [show]);
  const api = useMemo(() => ({ success, error }), [success, error]);
  const close = () => setOpen(false);
  const handleSnackbarClose = (_event: unknown, reason?: SnackbarCloseReason) => {
    // A click elsewhere (e.g. on the page behind) should not swallow the toast and its action.
    if (reason === "clickaway") return;
    close();
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Snackbar
        key={toast?.key}
        open={open}
        autoHideDuration={5000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {toast ? (
          <Alert
            severity={toast.severity}
            onClose={close}
            role={toast.severity === "error" ? "alert" : "status"}
            variant="filled"
            action={
              toast.action ? (
                <Button component={Link} to={toast.action.to} onClick={close} size="small" color="inherit">
                  {toast.action.label}
                </Button>
              ) : undefined
            }
          >
            {toast.text}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  );
}
