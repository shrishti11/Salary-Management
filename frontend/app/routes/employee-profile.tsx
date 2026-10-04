import { Alert, Box, Button, Link as MuiLink, Paper, Snackbar, Typography } from "@mui/material";
import { useEffect, useState, type ReactNode } from "react";
import { isRouteErrorResponse, Link, useFetcher, useLoaderData, useRouteError, useSearchParams } from "react-router";

import ConfirmDialog from "~/components/common/ConfirmDialog";
import StatusChip from "~/components/common/StatusChip";
import PageHeader from "~/components/layout/PageHeader";
import CompensationSection from "~/components/salary/CompensationSection";
import SalaryFormDialog from "~/components/salary/SalaryFormDialog";
import { countryName } from "~/lib/countries";
import { getEmployee, setEmployeeStatus } from "~/lib/employees-api";
import { createSalary, getSalaries, toSalaryFormError, type Salary } from "~/lib/salaries-api";
import { nextDay, toPayload, type SalaryFormValues } from "~/lib/salary-form";
import type { Route } from "./+types/employee-profile";

export async function loader({ request, params }: Route.LoaderArgs) {
  const [employee, salaries] = await Promise.all([getEmployee(request, params.id), getSalaries(request, params.id)]);
  if (!employee.ok) throw new Response(employee.message, { status: employee.status });
  return { employee: employee.data.employee, salaries };
}

type SalaryFieldError = ReturnType<typeof toSalaryFormError>;

export async function action({
  request,
  params,
}: Route.ActionArgs): Promise<{ message: string } | ({ error: string } & Partial<SalaryFieldError>)> {
  if (request.headers.get("content-type")?.includes("application/json")) {
    let payload: ReturnType<typeof toPayload>;
    try {
      payload = toPayload((await request.json()) as SalaryFormValues);
    } catch {
      return { error: "Invalid salary data" };
    }
    const result = await createSalary(request, params.id, payload);
    return result.ok ? { message: "Salary saved" } : { error: result.message, ...toSalaryFormError(result) };
  }

  const formData = await request.formData();
  const status = formData.get("status");

  if (status !== "ACTIVE" && status !== "INACTIVE") return { error: "Invalid status" };

  const result = await setEmployeeStatus(request, params.id, status);
  if (!result.ok) return { error: result.message };

  return {
    message: status === "ACTIVE" ? "Employee activated" : "Employee deactivated",
  };
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && (error.status === 404 || error.status === 400);

  return (
    <>
      <PageHeader title={notFound ? "Employee not found" : "Employee"} />
      <Alert severity={notFound ? "warning" : "error"} sx={{ mb: 2 }}>
        {notFound ? "This employee does not exist or was removed." : "Could not load this employee."}
      </Alert>
      <Button component={Link} to="/employees">
        Back to employees
      </Button>
    </>
  );
}

const NOTICES: Record<string, string> = {
  created: "Employee created",
  updated: "Employee updated",
};

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography component="div">{children}</Typography>
    </Box>
  );
}

export default function EmployeeProfile() {
  const { employee, salaries } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const salaryFetcher = useFetcher<typeof action>();
  // Captured when the dialog opens so a loader revalidation cannot reset in-progress edits.
  const [dialog, setDialog] = useState<{
    mode: "initial" | "revise";
    current: Salary | null;
    minDate: string;
  } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [salaryError, setSalaryError] = useState<SalaryFieldError | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<{
    severity: "success" | "error";
    text: string;
  } | null>(null);

  const notice = NOTICES[searchParams.get("notice") ?? ""];
  useEffect(() => {
    if (!notice) return;
    setToast({ severity: "success", text: notice });
    setSearchParams({}, { replace: true });
  }, [notice, setSearchParams]);

  useEffect(() => {
    const data = fetcher.data;
    if (!data) return;
    if ("error" in data) setToast({ severity: "error", text: data.error });
    else setToast({ severity: "success", text: data.message });
  }, [fetcher.data]);

  useEffect(() => {
    const data = salaryFetcher.data;
    if (!data) return;
    if ("error" in data) {
      setSalaryError({
        message: data.error,
        ...(data.field && { field: data.field }),
      });
    } else {
      setToast({ severity: "success", text: data.message });
      setSalaryError(null);
      setDialogOpen(false);
    }
  }, [salaryFetcher.data]);

  const openSalaryDialog = (mode: "initial" | "revise") => {
    const overview = salaries.ok ? salaries.data : null;
    const latest = overview?.history[0];
    setSalaryError(null);
    setDialog({
      mode,
      // Revise from the latest record (not `current`): a scheduled record supersedes it.
      current: latest ?? null,
      minDate:
        latest && nextDay(latest.effectiveDate) > employee.joiningDate
          ? nextDay(latest.effectiveDate)
          : employee.joiningDate,
    });
    setDialogOpen(true);
  };

  const closeSalaryDialog = () => {
    setSalaryError(null);
    setDialogOpen(false);
  };

  const changeStatus = (status: "ACTIVE" | "INACTIVE") => {
    setConfirmOpen(false);
    fetcher.submit({ status }, { method: "post" });
  };

  const closeToast = () => {
    setToast(null);
  };

  const saving = fetcher.state !== "idle";
  const fullName = `${employee.firstName} ${employee.lastName}`;

  return (
    <>
      <Box sx={{ mb: 1 }}>
        <MuiLink component={Link} to="/employees">
          ← Back to employees
        </MuiLink>
      </Box>

      <PageHeader
        title={fullName}
        action={
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button component={Link} to={`/employees/${employee.id}?edit=1`} variant="outlined">
              Edit
            </Button>
            {employee.status === "ACTIVE" ? (
              <Button color="error" variant="outlined" disabled={saving} onClick={() => setConfirmOpen(true)}>
                Deactivate
              </Button>
            ) : (
              <Button variant="contained" disabled={saving} onClick={() => changeStatus("ACTIVE")}>
                Reactivate
              </Button>
            )}
          </Box>
        }
      />

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box
          sx={{
            display: "grid",
            gap: 3,
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" },
          }}
        >
          <Detail label="Employee ID">{employee.employeeCode}</Detail>
          <Detail label="Status">
            <StatusChip status={employee.status} />
          </Detail>
          <Detail label="Email">{employee.email}</Detail>
          <Detail label="Phone">{employee.phone ?? "—"}</Detail>
          <Detail label="Department">{employee.department.name}</Detail>
          <Detail label="Designation">{employee.designation}</Detail>
          <Detail label="Country">{countryName(employee.country)}</Detail>
          <Detail label="Joining date">{employee.joiningDate}</Detail>
        </Box>
      </Paper>

      <CompensationSection
        result={salaries}
        employeeActive={employee.status === "ACTIVE"}
        onSetSalary={() => openSalaryDialog("initial")}
        onReviseSalary={() => openSalaryDialog("revise")}
      />

      {dialog && (
        <SalaryFormDialog
          open={dialogOpen}
          mode={dialog.mode}
          current={dialog.current}
          minDate={dialog.minDate}
          submitting={salaryFetcher.state !== "idle"}
          serverError={salaryError}
          onClose={closeSalaryDialog}
          onSubmit={(values) =>
            salaryFetcher.submit(values, {
              method: "post",
              encType: "application/json",
            })
          }
        />
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Deactivate employee?"
        message={`${fullName} will be marked inactive. Their record and history are kept, and you can reactivate them at any time.`}
        confirmLabel="Deactivate"
        loading={saving}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => changeStatus("INACTIVE")}
      />

      <Snackbar open={toast !== null} autoHideDuration={5000} onClose={closeToast}>
        {toast ? (
          <Alert severity={toast.severity} onClose={closeToast} role={toast.severity === "error" ? "alert" : "status"}>
            {toast.text}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}
