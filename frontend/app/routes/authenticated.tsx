import AppLayout from "~/components/layout/AppLayout";
import { requireUser } from "~/lib/require-user";
import type { Route } from "./+types/authenticated";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return { user };
}

export default function Authenticated({ loaderData }: Route.ComponentProps) {
  return <AppLayout user={loaderData.user} />;
}
