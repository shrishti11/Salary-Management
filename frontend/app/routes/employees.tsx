import { Alert, Box, Button, LinearProgress, TablePagination, Typography } from "@mui/material";
import { Link, redirect, useLoaderData, useNavigation, useSearchParams } from "react-router";

import EmployeeFilters from "~/components/employees/EmployeeFilters";
import EmployeeTable from "~/components/employees/EmployeeTable";
import PageHeader from "~/components/layout/PageHeader";
import {
  DEFAULT_LIST_PARAMS,
  PAGE_SIZES,
  listDepartments,
  listEmployees,
  parseListParams,
  toSearchParams,
  type ListParams,
  type SortField,
} from "~/lib/employees-api";
import type { Route } from "./+types/employees";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const params = parseListParams(url.searchParams);

  const [employees, departments] = await Promise.all([
    listEmployees(request, params),
    listDepartments(request),
  ]);

  if (!employees.ok) throw new Response(employees.message, { status: employees.status });
  if (!departments.ok) throw new Response(departments.message, { status: departments.status });

  const { data, pagination } = employees.data;

  // A hand-edited or stale page number past the end: jump to the last page.
  if (data.length === 0 && pagination.total > 0 && params.page > 1) {
    const query = toSearchParams({ ...params, page: pagination.totalPages }).toString();
    throw redirect(`/employees${query ? `?${query}` : ""}`);
  }

  return { params, employees: data, pagination, departments: departments.data.departments };
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
  const { params, employees, pagination, departments } = useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();
  const navigation = useNavigation();

  const update = (patch: Partial<ListParams>, resetPage = true) => {
    setSearchParams(toSearchParams({ ...params, ...patch, ...(resetPage ? { page: 1 } : {}) }));
  };

  const handleSort = (field: SortField) => {
    update(
      field === params.sortBy
        ? { sortOrder: params.sortOrder === "asc" ? "desc" : "asc" }
        : { sortBy: field, sortOrder: "asc" },
    );
  };

  const hasFilters = Boolean(params.q || params.departmentId || params.country || params.status);
  const loading = navigation.state === "loading";

  return (
    <>
      <PageHeader
        title="Employees"
        action={
          <Button variant="contained" component={Link} to="/employees/new">
            Add employee
          </Button>
        }
      />

      <EmployeeFilters
        values={{ q: params.q, departmentId: params.departmentId, country: params.country, status: params.status }}
        departments={departments}
        onChange={(patch) => update(patch)}
        onClear={() =>
          setSearchParams(
            toSearchParams({
              ...DEFAULT_LIST_PARAMS,
              sortBy: params.sortBy,
              sortOrder: params.sortOrder,
              pageSize: params.pageSize,
            }),
          )
        }
      />

      {loading && <LinearProgress aria-label="Loading employees" sx={{ mb: 1 }} />}

      {employees.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography variant="h6" gutterBottom>
            {hasFilters ? "No employees match your filters" : "No employees yet"}
          </Typography>
          {hasFilters ? (
            <Button onClick={() => setSearchParams(new URLSearchParams())}>Clear filters</Button>
          ) : (
            <Button variant="contained" component={Link} to="/employees/new">
              Add employee
            </Button>
          )}
        </Box>
      ) : (
        <Box sx={{ opacity: loading ? 0.6 : 1 }}>
          <EmployeeTable
            employees={employees}
            sortBy={params.sortBy}
            sortOrder={params.sortOrder}
            onSort={handleSort}
          />
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
