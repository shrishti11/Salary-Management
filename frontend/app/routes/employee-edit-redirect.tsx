import { redirect } from "react-router";

// Editing an employee is now a dialog on the profile page.
export function loader({ params }: { params: { id: string } }) {
  return redirect(`/employees/${params.id}?edit=1`);
}

export default function EmployeeEditRedirect() {
  return null;
}
