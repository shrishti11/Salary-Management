import { redirect } from "react-router";

// Adding an employee is now a dialog on the Employees page.
export function loader() {
  return redirect("/employees?add=1");
}

export default function EmployeeNewRedirect() {
  return null;
}
