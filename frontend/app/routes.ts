import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  layout("routes/authenticated.tsx", [
    route("dashboard", "routes/dashboard.tsx"),
    route("employees", "routes/employees.tsx"),
    route("employees/new", "routes/employee-new-redirect.tsx"),
    route("employees/:id", "routes/employee-profile.tsx"),
    route("employees/:id/edit", "routes/employee-edit-redirect.tsx"),
    route("salaries", "routes/salaries-redirect.tsx"),
    route("analytics", "routes/analytics.tsx"),
  ]),
  index("routes/home.tsx"),
] satisfies RouteConfig;
