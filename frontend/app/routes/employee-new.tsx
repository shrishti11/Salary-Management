import { redirect, useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";

import EmployeeForm from "~/components/employees/EmployeeForm";
import PageHeader from "~/components/layout/PageHeader";
import type { EmployeeFormValues } from "~/lib/employee-form";
import { createEmployee, listDepartments, toFormError } from "~/lib/employees-api";
import type { Route } from "./+types/employee-new";

export async function loader({ request }: Route.LoaderArgs) {
  const departments = await listDepartments(request);
  if (!departments.ok) throw new Response(departments.message, { status: departments.status });
  return { departments: departments.data.departments };
}

export async function action({ request }: Route.ActionArgs) {
  const input = (await request.json()) as EmployeeFormValues;
  const result = await createEmployee(request, input);

  if (!result.ok) return { error: toFormError(result) };

  return redirect(`/employees/${result.data.employee.id}?notice=created`);
}

export default function EmployeeNew() {
  const { departments } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();

  return (
    <>
      <PageHeader title="Add employee" />
      <EmployeeForm
        mode="create"
        departments={departments}
        submitting={navigation.state !== "idle"}
        serverError={actionData?.error}
        cancelHref="/employees"
        onSubmit={(values) => submit(values, { method: "post", encType: "application/json" })}
      />
    </>
  );
}
