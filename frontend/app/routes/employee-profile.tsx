import { Alert, Avatar, Box, Button, IconButton, Menu, MenuItem, Paper, Tab, Tabs, Typography } from "@mui/material";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  isRouteErrorResponse,
  Link,
  useFetcher,
  useLoaderData,
  useRouteError,
  useSearchParams,
  type ShouldRevalidateFunctionArgs,
} from "react-router";

import ConfirmDialog from "~/components/common/ConfirmDialog";
import StatusChip from "~/components/common/StatusChip";
import { useToast } from "~/components/common/ToastProvider";
import EmployeeFormDialog from "~/components/employees/EmployeeFormDialog";
import PageHeader from "~/components/layout/PageHeader";
import CompensationSection from "~/components/salary/CompensationSection";
import SalaryFormDialog from "~/components/salary/SalaryFormDialog";
import { countryName } from "~/lib/countries";
import type { EmployeeFormValues } from "~/lib/employee-form";
import {
  getEmployee,
  listDepartments,
  setEmployeeStatus,
  toFormError,
  updateEmployee,
  type FormError,
} from "~/lib/employees-api";
import { createSalary, getSalaries, toSalaryFormError, type Salary } from "~/lib/salaries-api";
import { nextDay, toPayload, type SalaryFormValues } from "~/lib/salary-form";
import type { Route } from "./+types/employee-profile";

export async function loader({ request, params }: Route.LoaderArgs) {
  const [employee, salaries, departments] = await Promise.all([
    getEmployee(request, params.id),
    getSalaries(request, params.id),
    listDepartments(request),
  ]);
  if (!employee.ok) throw new Response(employee.message, { status: employee.status });
  return {
    employee: employee.data.employee,
    salaries,
    // The edit dialog still works with the employee's own department if the list cannot be loaded.
    departments: departments.ok ? departments.data.departments : [employee.data.employee.department],
  };
}

/** The edit and salary dialogs live in the URL; toggling them must not refetch the profile. */
const DIALOG_PARAMS = ["edit", "salary"];

export function shouldRevalidate({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (!formMethod && currentUrl.pathname === nextUrl.pathname) {
    const withoutDialogs = (url: URL) => {
      const params = new URLSearchParams(url.search);
      DIALOG_PARAMS.forEach((name) => params.delete(name));
      params.sort();
      return params.toString();
    };
    if (withoutDialogs(currentUrl) === withoutDialogs(nextUrl)) return false;
  }
  return defaultShouldRevalidate;
}

type SalaryFieldError = ReturnType<typeof toSalaryFormError>;

type ActionBody =
  | ({ intent: "update" } & EmployeeFormValues)
  | ({ intent: "salary" } & SalaryFormValues)
  | { intent: "status"; status: unknown };

type ActionResult =
  | { intent: "update"; message: string }
  | { intent: "update"; error: FormError }
  | { intent: "salary"; message: string }
  | { intent: "salary"; error: SalaryFieldError }
  | { intent: "status"; message: string }
  | { intent: "status"; error: string }
  | { intent: "unknown"; error: string };

const UNSUPPORTED: ActionResult = { intent: "unknown", error: "Unsupported action" };

export async function action({ request, params }: Route.ActionArgs): Promise<ActionResult> {
  let body: ActionBody | null;
  try {
    body = (await request.json()) as ActionBody | null;
  } catch {
    return UNSUPPORTED;
  }
  if (!body || typeof body !== "object") return UNSUPPORTED;

  switch (body.intent) {
    case "update": {
      // The employee code is immutable; never send it.
      const { intent: _intent, employeeCode: _employeeCode, ...input } = body;
      const result = await updateEmployee(request, params.id, input);
      return result.ok ? { intent: "update", message: "Employee updated" } : { intent: "update", error: toFormError(result) };
    }
    case "salary": {
      const { intent: _intent, ...values } = body;
      let payload: ReturnType<typeof toPayload>;
      try {
        payload = toPayload(values);
      } catch {
        return { intent: "salary", error: { message: "Invalid salary data" } };
      }
      const result = await createSalary(request, params.id, payload);
      return result.ok ? { intent: "salary", message: "Salary saved" } : { intent: "salary", error: toSalaryFormError(result) };
    }
    case "status": {
      const { status } = body;
      if (status !== "ACTIVE" && status !== "INACTIVE") return { intent: "status", error: "Invalid status" };
      const result = await setEmployeeStatus(request, params.id, status);
      if (!result.ok) return { intent: "status", error: result.message };
      return { intent: "status", message: status === "ACTIVE" ? "Employee activated" : "Employee deactivated" };
    }
    default:
      return UNSUPPORTED;
  }
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

function DetailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
        {title}
      </Typography>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" } }}>{children}</Box>
    </Paper>
  );
}

type ProfileTab = "overview" | "compensation";

/**
 * Runs `handle` once per fetcher result, and only after the fetcher is idle. While the fetcher is
 * still "loading" (revalidating after its action), a URL change from the handler would abort that
 * revalidation and leave the page showing stale loader data.
 */
function useFetcherResult<T>(fetcher: { state: string; data: T | undefined }, handle: (data: T) => void) {
  const handled = useRef<T | undefined>(undefined);
  useEffect(() => {
    const data = fetcher.data;
    if (fetcher.state !== "idle" || data === undefined || handled.current === data) return;
    handled.current = data;
    handle(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
}

export default function EmployeeProfile() {
  const { employee, salaries, departments } = useLoaderData<typeof loader>();
  const toast = useToast();
  const statusFetcher = useFetcher<typeof action>();
  const salaryFetcher = useFetcher<typeof action>();
  const editFetcher = useFetcher<typeof action>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState<ProfileTab>("overview");
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Cleared whenever the edit dialog closes, so a reopened dialog never shows a stale server error.
  const [editError, setEditError] = useState<FormError | null>(null);
  // Captured when the dialog opens so a loader revalidation cannot reset in-progress edits.
  const [dialog, setDialog] = useState<{ mode: "initial" | "revise"; current: Salary | null; minDate: string } | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [salaryError, setSalaryError] = useState<SalaryFieldError | null>(null);

  const active = employee.status === "ACTIVE";
  const overview = salaries.ok ? salaries.data : null;
  const history = overview ? [...overview.history].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)) : [];
  // The mode follows the data, not the request: with no record there is nothing to revise.
  const salaryMode = history.length > 0 ? "revise" : "initial";
  const canChangeSalary = active && overview !== null;
  const showCompensation = salaries.ok || salaries.status !== 403;
  const activeTab: ProfileTab = showCompensation ? tab : "overview";

  const removeParam = (name: string) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(name);
        return next;
      },
      { replace: true },
    );

  // --- Edit dialog (fully URL-driven) ---
  const editOpen = searchParams.get("edit") === "1";

  const openEdit = () =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("edit", "1");
        return next;
      },
      { replace: true },
    );

  const closeEdit = () => {
    setEditError(null);
    removeParam("edit");
  };

  useFetcherResult(editFetcher, (data) => {
    if (data.intent !== "update") return;
    if ("error" in data) {
      setEditError(data.error);
    } else {
      closeEdit();
      toast.success(data.message);
    }
  });

  // --- Salary dialog (opened through ?salary=, see the effect below) ---
  // Replace rather than push, like ?edit=1: closing strips the param with a replace, so a pushed
  // entry would let Back reopen a dialog the user already dismissed.
  const requestSalaryDialog = () =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("salary", salaryMode);
        return next;
      },
      { replace: true },
    );

  const openSalaryDialog = () => {
    const latest = history[0];
    setSalaryError(null);
    setDialog({
      mode: salaryMode,
      // Revise from the latest record (not `current`): a scheduled record supersedes it.
      current: latest ?? null,
      minDate:
        latest && nextDay(latest.effectiveDate) > employee.joiningDate ? nextDay(latest.effectiveDate) : employee.joiningDate,
    });
    setDialogOpen(true);
    setTab("compensation");
  };

  const closeSalaryDialog = () => {
    setSalaryError(null);
    setDialogOpen(false);
    if (searchParams.has("salary")) removeParam("salary");
  };

  // `?salary=initial|revise` (from the directory, the toast or the buttons here) opens the dialog
  // once; closing removes the param.
  // Ignored (and stripped) for unrecognised values, inactive employees, unloaded salaries, or when
  // the edit dialog is also requested: edit wins so two dialogs never open at once.
  const salaryParam = searchParams.get("salary");
  const handledSalaryParam = useRef(false);
  useEffect(() => {
    if (salaryParam === null) {
      handledSalaryParam.current = false;
      return;
    }
    if (handledSalaryParam.current) return;
    handledSalaryParam.current = true;
    const valid = salaryParam === "initial" || salaryParam === "revise";
    if (valid && canChangeSalary && !editOpen) openSalaryDialog();
    else removeParam("salary");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salaryParam, canChangeSalary, editOpen]);

  useFetcherResult(salaryFetcher, (data) => {
    if (data.intent !== "salary") return;
    if ("error" in data) {
      setSalaryError(data.error);
    } else {
      toast.success(data.message);
      closeSalaryDialog();
    }
  });

  // --- Status ---
  const changeStatus = (status: "ACTIVE" | "INACTIVE") => {
    setMenuAnchor(null);
    setConfirmOpen(false);
    statusFetcher.submit({ intent: "status", status }, { method: "post", encType: "application/json" });
  };

  useFetcherResult(statusFetcher, (data) => {
    if (data.intent === "update" || data.intent === "salary") return;
    if ("error" in data) toast.error(data.error);
    else toast.success(data.message);
  });

  const savingStatus = statusFetcher.state !== "idle";
  const fullName = `${employee.firstName} ${employee.lastName}`;
  const initials = `${employee.firstName.charAt(0)}${employee.lastName.charAt(0)}`.toUpperCase();

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Employees", to: "/employees" }, { label: fullName }]}
        title={fullName}
        subtitle={`${employee.designation} · ${employee.department.name} · ${countryName(employee.country)}`}
        leading={
          <Avatar sx={{ width: 56, height: 56, bgcolor: "primary.light", color: "primary.main", fontWeight: 600 }}>
            {initials}
          </Avatar>
        }
        titleAdornment={<StatusChip status={employee.status} />}
        action={
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <Button variant="outlined" onClick={openEdit}>
              Edit
            </Button>
            {canChangeSalary && (
              <Button variant="contained" onClick={requestSalaryDialog}>
                {salaryMode === "revise" ? "Revise salary" : "Set salary"}
              </Button>
            )}
            <IconButton
              aria-label="More actions"
              aria-haspopup="menu"
              disabled={savingStatus}
              onClick={(event) => setMenuAnchor(event.currentTarget)}
            >
              <Box component="span" aria-hidden sx={{ fontSize: 20, lineHeight: 1, width: 24 }}>
                ⋯
              </Box>
            </IconButton>
            <Menu anchorEl={menuAnchor} open={menuAnchor !== null} onClose={() => setMenuAnchor(null)}>
              {active ? (
                <MenuItem
                  sx={{ color: "error.main" }}
                  onClick={() => {
                    setMenuAnchor(null);
                    setConfirmOpen(true);
                  }}
                >
                  Deactivate
                </MenuItem>
              ) : (
                <MenuItem onClick={() => changeStatus("ACTIVE")}>Reactivate</MenuItem>
              )}
            </Menu>
          </Box>
        }
      />

      <Tabs
        value={activeTab}
        onChange={(_event, value: ProfileTab) => setTab(value)}
        aria-label="Employee sections"
        sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
      >
        <Tab label="Overview" value="overview" id="profile-tab-overview" aria-controls="profile-panel-overview" />
        {showCompensation && (
          <Tab
            label="Compensation"
            value="compensation"
            id="profile-tab-compensation"
            aria-controls="profile-panel-compensation"
          />
        )}
      </Tabs>

      {activeTab === "overview" ? (
        <Box
          role="tabpanel"
          id="profile-panel-overview"
          aria-labelledby="profile-tab-overview"
          sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", md: "1fr 2fr" }, alignItems: "start" }}
        >
          <DetailCard title="Contact">
            <Detail label="Email">{employee.email}</Detail>
            <Detail label="Phone">{employee.phone ?? "—"}</Detail>
          </DetailCard>
          <DetailCard title="Employment">
            <Detail label="Employee ID">{employee.employeeCode}</Detail>
            <Detail label="Department">{employee.department.name}</Detail>
            <Detail label="Designation">{employee.designation}</Detail>
            <Detail label="Country">{countryName(employee.country)}</Detail>
            <Detail label="Joining date">{employee.joiningDate}</Detail>
          </DetailCard>
        </Box>
      ) : (
        <Box role="tabpanel" id="profile-panel-compensation" aria-labelledby="profile-tab-compensation">
          <CompensationSection
            result={salaries}
            employeeActive={active}
            onSetSalary={canChangeSalary ? requestSalaryDialog : undefined}
          />
        </Box>
      )}

      <EmployeeFormDialog
        open={editOpen}
        mode="edit"
        departments={departments}
        defaultValues={{
          employeeCode: employee.employeeCode,
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email,
          phone: employee.phone ?? "",
          departmentId: employee.departmentId,
          designation: employee.designation,
          country: employee.country,
          joiningDate: employee.joiningDate,
        }}
        submitting={editFetcher.state !== "idle"}
        serverError={editError}
        onClose={closeEdit}
        onSubmit={(values) =>
          editFetcher.submit({ intent: "update", ...values }, { method: "post", encType: "application/json" })
        }
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
            salaryFetcher.submit({ intent: "salary", ...values }, { method: "post", encType: "application/json" })
          }
        />
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Deactivate employee?"
        message={`${fullName} will be marked inactive. Their record and history are kept, and you can reactivate them at any time.`}
        confirmLabel="Deactivate"
        loading={savingStatus}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => changeStatus("INACTIVE")}
      />
    </>
  );
}
