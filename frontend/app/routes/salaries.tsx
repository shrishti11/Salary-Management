import { Alert, Box, Button, LinearProgress, TablePagination, Typography } from "@mui/material";
import { useEffect, useRef } from "react";
import { Link, redirect, useLoaderData, useNavigation, useSearchParams } from "react-router";

import PageHeader from "~/components/layout/PageHeader";
import SalaryDirectoryFilters, { hasActiveSalaryFilters } from "~/components/salary/SalaryDirectoryFilters";
import SalaryDirectoryTable from "~/components/salary/SalaryDirectoryTable";
import { PAGE_SIZES, listDepartments } from "~/lib/employees-api";
import {
  DEFAULT_SALARY_LIST_PARAMS,
  listSalaryDirectory,
  parseSalaryListParams,
  toSalarySearchParams,
  type SalaryListParams,
  type SalarySortField,
} from "~/lib/salary-directory-api";
import type { Route } from "./+types/salaries";

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
    throw redirect(`/salaries${query ? `?${query}` : ""}`);
  }

  return { params, rows: data, pagination, departments: departments.data.departments };
}

export function ErrorBoundary() {
  return (
    <>
      <PageHeader title="Salaries" />
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" component={Link} to="/salaries">
            Try again
          </Button>
        }
      >
        Could not load salaries. Please try again.
      </Alert>
    </>
  );
}

export default function Salaries() {
  const { params, rows, pagination, departments } = useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();
  const navigation = useNavigation();

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

  const hasFilters = hasActiveSalaryFilters(params);
  const loading = navigation.state === "loading";

  return (
    <>
      <PageHeader title="Salaries" />

      <SalaryDirectoryFilters
        values={{
          q: params.q,
          departmentId: params.departmentId,
          country: params.country,
          status: params.status,
          salary: params.salary,
        }}
        departments={departments}
        onChange={(patch) => update(patch)}
        onClear={clearFilters}
      />

      {loading && <LinearProgress aria-label="Loading salaries" sx={{ mb: 1 }} />}

      {rows.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography variant="h6" gutterBottom>
            {hasFilters ? "No employees match your filters" : "No employees yet"}
          </Typography>
          {hasFilters ? (
            <Typography color="text.secondary">Try a different search or use Clear filters above.</Typography>
          ) : (
            <Button variant="contained" component={Link} to="/employees/new">
              Add employee
            </Button>
          )}
        </Box>
      ) : (
        <Box sx={{ opacity: loading ? 0.6 : 1 }}>
          <SalaryDirectoryTable rows={rows} sortBy={params.sortBy} sortOrder={params.sortOrder} onSort={handleSort} />
          <TablePagination
            component="div"
            count={pagination.total}
            page={pagination.page - 1}
            rowsPerPage={pagination.pageSize}
            rowsPerPageOptions={[...PAGE_SIZES]}
            onPageChange={(_event, page) => update({ page: page + 1 }, false)}
            onRowsPerPageChange={(event) => update({ pageSize: Number(event.target.value) })}
          />
        </Box>
      )}
    </>
  );
}
