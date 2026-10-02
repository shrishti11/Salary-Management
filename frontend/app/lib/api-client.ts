const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

/** apiFetch for SSR loaders/actions: forwards the incoming request's cookie to the backend. */
export function apiFetchAs(request: Request, path: string, init: RequestInit = {}): Promise<Response> {
  const cookie = request.headers.get("cookie");
  return apiFetch(path, {
    ...init,
    headers: { ...(cookie ? { cookie } : {}), ...init.headers },
  });
}
