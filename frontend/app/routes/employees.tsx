import { Alert, Box, Button, LinearProgress, Paper, TablePagination } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { Link, redirect, useFetcher, useLoaderData, useNavigation, useSearchParams } from "react-router";

import ConfirmDialog from "~/components/common/ConfirmDialog";
import EmptyState from "~/components/common/EmptyState";
import { useToast } from "~/components/common/ToastProvider";
import EmployeeDirectoryTable, { type EmployeeRowAction } from "~/components/employees/EmployeeDirectoryTable";
import EmployeeFilterBar, { hasActiveFilters } from "~/components/employees/EmployeeFilterBar";
import EmployeeFormDialog from "~/components/employees/EmployeeFormDialog";
import PageHeader from "~/components/layout/PageHeader";
import type { EmployeeFormValues } from "~/lib/employee-form";
import {
  PAGE_SIZES,
  createEmployee,
  listDepartments,
  setEmployeeStatus,
  toFormError,
  type FormError,
} from "~/lib/employees-api";
import {
  DEFAULT_SALARY_LIST_PARAMS,
  listSalaryDirectory,
  parseSalaryListParams,
  toSalarySearchParams,
  type SalaryDirectoryRow,
  type SalaryListParams,
  type SalarySortField,
} from "~/lib/salary-directory-api";
import type { Route } from "./+types/employees";

export async function loader({ request }: Route.LoaderArgs) {
  const params = parseSalaryListParams(new URL(request.url).searchParams);

  const [directory, departments] = await Promise.all([
    listSalaryDirectory(request, params),
    listDepartments(request),
  ]);

  if (!directory.ok) throw new Response(directory.message, { status: directory.status });
  if (!departments.ok) throw new Response(departments.message, { status: departments.status });

  const { data, pagination } = directory.data;

  // A hand-edited or stale page number past the end: jump to the last page.
  if (data.length === 0 && pagination.total > 0 && params.page > 1 && params.page !== pagination.totalPages) {
    const query = toSalarySearchParams({ ...params, page: pagination.totalPages }).toString();
    throw redirect(`/employees${query ? `?${query}` : ""}`);
  }

  return { params, rows: data, pagination, departments: departments.data.departments };
}

type ActionBody =
  | ({ intent: "create" } & EmployeeFormValues)
  | { intent: "status"; employeeId: string; status: string };

type ActionResult =
  | { intent: "create"; error: FormError }
  | { intent: "create"; message: string; createdId: string }
  | { intent: "status" | "unknown"; error: string }
  | { intent: "status"; message: string };

const UNSUPPORTED: ActionResult = { intent: "unknown", error: "Unsupported action" };

export async function action({ request }: Route.ActionArgs): Promise<ActionResult> {
  let body: ActionBody | null;
  try {
    body = (await request.json()) as ActionBody | null;
  } catch {
    return UNSUPPORTED;
  }
  if (!body || typeof body !== "object") return UNSUPPORTED;

  if (body.intent === "create") {
    const { intent: _intent, ...values } = body;
    const result = await createEmployee(request, values);
    if (!result.ok) return { intent: "create", error: toFormError(result) };
    return { intent: "create", message: "Employee added", createdId: result.data.employee.id };
  }

  if (body.intent === "status") {
    const { employeeId, status } = body;
    if (typeof employeeId !== "string" || !employeeId || (status !== "ACTIVE" && status !== "INACTIVE")) {
      return { intent: "status", error: "Invalid status" };
    }
    const result = await setEmployeeStatus(request, employeeId, status);
    if (!result.ok) return { intent: "status", error: result.message };
    return { intent: "status", message: status === "ACTIVE" ? "Employee activated" : "Employee deactivated" };
  }

  return UNSUPPORTED;
}

export function ErrorBoundary() {
  return (
    <>
      <PageHeader title="Employees" />
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" component={Link} to="/employees">
            Try again
          </Button>
        }
      >
        Could not load employees. Please try again.
      </Alert>
    </>
  );
}

export default function Employees() {
  const { params, rows, pagination, departments } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const fetcher = useFetcher<typeof action>();
  const toast = useToast();

  const addOpen = searchParams.get("add") === "1";
  // Cleared whenever the add dialog closes, so a reopened dialog never shows a stale server error.
  const [createError, setCreateError] = useState<FormError | null>(null);
  const [confirmRow, setConfirmRow] = useState<SalaryDirectoryRow | null>(null);

  // Always apply changes to the latest requested state, not the render-time snapshot:
  // debounced and rapid successive changes can fire before the previous navigation commits.
  const latest = useRef(params);
  useEffect(() => {
    latest.current = params;
  }, [params]);

  const commit = (next: SalaryListParams) => {
    latest.current = next;
    setSearchParams(toSalarySearchParams(next));
  };

  const update = (patch: Partial<SalaryListParams>, resetPage = true) => {
    commit({ ...latest.current, ...patch, ...(resetPage ? { page: 1 } : {}) });
  };

  const clearFilters = () => {
    const { sortBy, sortOrder, pageSize } = latest.current;
    commit({ ...DEFAULT_SALARY_LIST_PARAMS, sortBy, sortOrder, pageSize });
  };

  const handleSort = (field: SalarySortField) => {
    const current = latest.current;
    update(
      field === current.sortBy
        ? { sortOrder: current.sortOrder === "asc" ? "desc" : "asc" }
        : { sortBy: field, sortOrder: "asc" },
    );
  };

  const openAdd = () =>
    setSearchParams((prev) => {
      prev.set("add", "1");
      return prev;
    });

  const closeAdd = () => {
    setCreateError(null);
    setSearchParams((prev) => {
      prev.delete("add");
      return prev;
    });
  };

  const submitStatus = (row: SalaryDirectoryRow, status: "ACTIVE" | "INACTIVE") =>
    fetcher.submit({ intent: "status", employeeId: row.employee.id, status }, { method: "post", encType: "application/json" });

  const handleAction = (kind: EmployeeRowAction, row: SalaryDirectoryRow) => {
    if (kind === "deactivate") setConfirmRow(row);
    else submitStatus(row, "ACTIVE");
  };

  // React to each action result once; the loader revalidates on its own after the action.
  useEffect(() => {
    const data = fetcher.data;
    if (!data) return;
    if (data.intent === "create") {
      if ("createdId" in data) {
        closeAdd();
        toast.success(data.message, { label: "Set salary", to: `/employees/${data.createdId}?salary=initial` });
      } else {
        setCreateError(data.error);
      }
      return;
    }
    setConfirmRow(null);
    if ("error" in data) toast.error(data.error);
    else toast.success(data.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data]);

  // Keep the name while the confirm dialog animates closed.
  const lastConfirmRow = useRef<SalaryDirectoryRow | null>(null);
  if (confirmRow) lastConfirmRow.current = confirmRow;
  const confirmName = lastConfirmRow.current
    ? `${lastConfirmRow.current.employee.firstName} ${lastConfirmRow.current.employee.lastName}`
    : "";

  const busy = fetcher.state !== "idle";
  const hasFilters = hasActiveFilters(params);
  const loading = navigation.state === "loading";
  const total = pagination.total;

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle={`${total} ${total === 1 ? "person" : "people"}`}
        action={
          <Button variant="contained" onClick={openAdd}>
            Add employee
          </Button>
        }
      />

      <EmployeeFilterBar
        values={{
          q: params.q,
          status: params.status,
          departmentId: params.departmentId,
          country: params.country,
          salary: params.salary,
        }}
        departments={departments}
        onChange={(patch) => update(patch)}
        onClear={clearFilters}
      />

      <Paper sx={{ overflow: "hidden" }}>
        {loading && <LinearProgress aria-label="Loading employees" />}
        {rows.length === 0 ? (
          hasFilters ? (
            <EmptyState
              title="No employees match your filters"
              description="Try a different search or filter."
              action={<Button onClick={clearFilters}>Clear filters</Button>}
            />
          ) : (
            <EmptyState
              title="No employees yet"
              description="Add your first employee to get started."
              action={
                <Button variant="contained" onClick={openAdd}>
                  Add employee
                </Button>
              }
            />
          )
        ) : (
          <Box sx={{ opacity: loading ? 0.6 : 1, transition: "opacity 120ms" }}>
            <EmployeeDirectoryTable
              rows={rows}
              sortBy={params.sortBy}
              sortOrder={params.sortOrder}
              onSort={handleSort}
              onAction={handleAction}
            />
            <TablePagination
              component="div"
              count={total}
              page={pagination.page - 1}
              rowsPerPage={pagination.pageSize}
              rowsPerPageOptions={[...PAGE_SIZES]}
              onPageChange={(_event, page) => update({ page: page + 1 }, false)}
              onRowsPerPageChange={(event) => update({ pageSize: Number(event.target.value) })}
              sx={{ borderTop: 1, borderColor: "divider" }}
            />
          </Box>
        )}
      </Paper>

      <EmployeeFormDialog
        open={addOpen}
        mode="create"
        departments={departments}
        submitting={busy && fetcher.json !== undefined && (fetcher.json as { intent?: string }).intent === "create"}
        serverError={createError}
        onClose={closeAdd}
        onSubmit={(values) => fetcher.submit({ intent: "create", ...values }, { method: "post", encType: "application/json" })}
      />

      <ConfirmDialog
        open={confirmRow !== null}
        title="Deactivate employee?"
        message={`${confirmName} will be marked inactive. Their record and history are kept, and you can reactivate them at any time.`}
        confirmLabel="Deactivate"
        loading={busy}
        onConfirm={() => confirmRow && submitStatus(confirmRow, "INACTIVE")}
        onCancel={() => setConfirmRow(null)}
      />
    </>
  );
}
