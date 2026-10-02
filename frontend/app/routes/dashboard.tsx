import { useRouteLoaderData } from "react-router";

import PageHeader from "~/components/layout/PageHeader";
import { AUTHENTICATED_ROUTE_ID } from "~/lib/route-ids";
import type { loader as authenticatedLoader } from "./authenticated";

export default function Dashboard() {
  const data = useRouteLoaderData<typeof authenticatedLoader>(AUTHENTICATED_ROUTE_ID);

  if (!data) {
    throw new Error("Dashboard must render inside the authenticated layout route");
  }

  return (
    <>
      <PageHeader title="Dashboard" />
      <p>
        Signed in as {data.user.name} ({data.user.role}).
      </p>
    </>
  );
}
