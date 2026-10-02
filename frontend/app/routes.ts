import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  layout("routes/authenticated.tsx", [route("dashboard", "routes/dashboard.tsx")]),
  index("routes/home.tsx"),
] satisfies RouteConfig;
