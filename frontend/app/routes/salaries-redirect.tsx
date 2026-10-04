import { redirect } from "react-router";

// The Salaries page was merged into Employees; keep old links and bookmarks working.
export function loader({ request }: { request: Request }) {
  return redirect(`/employees${new URL(request.url).search}`);
}

export default function SalariesRedirect() {
  return null;
}
