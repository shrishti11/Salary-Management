import { Alert, Box, Button, Card, CardContent, Link as MuiLink, Paper, Snackbar, Typography } from "@mui/material";
import { useEffect, useState, type ReactNode } from "react";
import { isRouteErrorResponse, Link, useFetcher, useLoaderData, useRouteError, useSearchParams } from "react-router";

import ConfirmDialog from "~/components/common/ConfirmDialog";
import StatusChip from "~/components/common/StatusChip";
import PageHeader from "~/components/layout/PageHeader";
import { countryName } from "~/lib/countries";
import { getEmployee, setEmployeeStatus } from "~/lib/employees-api";
import type { Route } from "./+types/employee-profile";

export async function loader({ request, params }: Route.LoaderArgs) {
  const result = await getEmployee(request, params.id);
  if (!result.ok) throw new Response(result.message, { status: result.status });
  return { employee: result.data.employee };
}

export async function action({ request, params }: Route.ActionArgs): Promise<{ message: string } | { error: string }> {
  const formData = await request.formData();
  const status = formData.get("status");

  if (status !== "ACTIVE" && status !== "INACTIVE") return { error: "Invalid status" };

  const result = await setEmployeeStatus(request, params.id, status);
  if (!result.ok) return { error: result.message };

  return { message: status === "ACTIVE" ? "Employee activated" : "Employee deactivated" };
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

const NOTICES: Record<string, string> = { created: "Employee created", updated: "Employee updated" };

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
  const { employee } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<{ severity: "success" | "error"; text: string } | null>(null);

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
            <Button component={Link} to={`/employees/${employee.id}/edit`} variant="outlined">
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
        <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" } }}>
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

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>
            Compensation
          </Typography>
          <Typography color="text.secondary">
            Compensation details will be available with the Salary module.
          </Typography>
        </CardContent>
      </Card>

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
