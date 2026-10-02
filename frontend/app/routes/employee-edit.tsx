import { redirect, useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";

import EmployeeForm from "~/components/employees/EmployeeForm";
import PageHeader from "~/components/layout/PageHeader";
import type { EmployeeFormValues } from "~/lib/employee-form";
import { getEmployee, listDepartments, toFormError, updateEmployee } from "~/lib/employees-api";
import type { Route } from "./+types/employee-edit";

export async function loader({ request, params }: Route.LoaderArgs) {
  const [employee, departments] = await Promise.all([
    getEmployee(request, params.id),
    listDepartments(request),
  ]);
  if (!employee.ok) throw new Response(employee.message, { status: employee.status });
  if (!departments.ok) throw new Response(departments.message, { status: departments.status });
  return { employee: employee.data.employee, departments: departments.data.departments };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { employeeCode: _employeeCode, ...input } = (await request.json()) as EmployeeFormValues;
  const result = await updateEmployee(request, params.id, input);

  if (!result.ok) return { error: toFormError(result) };

  return redirect(`/employees/${params.id}?notice=updated`);
}

export default function EmployeeEdit() {
  const { employee, departments } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();

  return (
    <>
      <PageHeader title="Edit employee" />
      <EmployeeForm
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
        submitting={navigation.state !== "idle"}
        serverError={actionData?.error}
        cancelHref={`/employees/${employee.id}`}
        onSubmit={(values) => submit(values, { method: "post", encType: "application/json" })}
      />
    </>
  );
}
