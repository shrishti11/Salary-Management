import { useEffect, useState, type ReactNode } from "react";

/** Recharts needs a browser to measure its container; render nothing during SSR. */
export default function ClientOnly({ children, fallback = null }: { children: () => ReactNode; fallback?: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <>{mounted ? children() : fallback}</>;
}
