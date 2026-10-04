import { Alert, Button, Snackbar } from "@mui/material";
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
  const [toast, setToast] = useState<Toast | null>(null);
  const success = useCallback((text: string, action?: ToastAction) => setToast({ severity: "success", text, action }), []);
  const error = useCallback((text: string) => setToast({ severity: "error", text }), []);
  const api = useMemo(() => ({ success, error }), [success, error]);
  const close = () => setToast(null);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Snackbar open={toast !== null} autoHideDuration={5000} onClose={close} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        {toast ? (
          <Alert
            severity={toast.severity}
            onClose={close}
            role={toast.severity === "error" ? "alert" : "status"}
            variant="filled"
            action={
              toast.action ? (
                <Button component={Link} to={toast.action.to} size="small" color="inherit">
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
