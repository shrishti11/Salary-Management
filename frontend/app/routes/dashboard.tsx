import { useRouteLoaderData } from "react-router";

import PageHeader from "~/components/layout/PageHeader";
import type { loader as authenticatedLoader } from "./authenticated";

export default function Dashboard() {
  const data = useRouteLoaderData<typeof authenticatedLoader>("routes/authenticated");

  return (
    <>
      <PageHeader title="Dashboard" />
      {data && (
        <p>
          Signed in as {data.user.name} ({data.user.role}).
        </p>
      )}
    </>
  );
}
