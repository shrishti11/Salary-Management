import { useEffect, useRef } from "react";

/**
 * Runs `handle` once per fetcher result, and only when the fetcher is idle again. Navigating or closing a dialog
 * while the fetcher is still "loading" lets a parent layout loader abort the revalidation and leave stale data.
 */
export function useFetcherResult<T>(fetcher: { state: string; data: T | undefined }, handle: (data: T) => void) {
  const handled = useRef<T | undefined>(undefined);
  useEffect(() => {
    const data = fetcher.data;
    if (fetcher.state !== "idle" || data === undefined || handled.current === data) return;
    handled.current = data;
    handle(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
}
