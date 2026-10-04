import { redirect } from "react-router";

import { apiFetchAs } from "~/lib/api-client";
import { parseSalaryListParams, toSalarySearchParams } from "~/lib/salary-directory-api";
import type { Route } from "./+types/employees-export";

/**
 * Streams the backend CSV through the frontend so the download works wherever the session cookie is valid.
 * Only the list's own filters are forwarded (anything else in the URL is dropped), and paging is ignored.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const { page: _page, pageSize: _pageSize, ...filters } = parseSalaryListParams(new URL(request.url).searchParams);
  const query = toSalarySearchParams(filters).toString();
  const response = await apiFetchAs(request, `/api/salaries/export${query ? `?${query}` : ""}`);

  if (response.status === 401) throw redirect("/login");
  if (!response.ok) throw new Response("Could not export employees", { status: response.status });

  const headers = new Headers({ "Content-Type": "text/csv; charset=utf-8" });
  const disposition = response.headers.get("content-disposition");
  if (disposition) headers.set("Content-Disposition", disposition);
  return new Response(await response.text(), { headers });
}
