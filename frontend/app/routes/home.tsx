import type { Route } from "./+types/home";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Salary Management" }];
}

export default function Home() {
  return null;
}
