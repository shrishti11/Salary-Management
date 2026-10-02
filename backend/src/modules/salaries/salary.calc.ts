export type ComponentType = "BASE" | "ALLOWANCE" | "BONUS" | "DEDUCTION";
export interface ComponentAmount {
  type: ComponentType;
  amount: string;
}

/** `amount` must already be validated as `-?\d+(\.\d{1,2})?`. */
export function toCents(amount: string): number {
  if (amount.startsWith("-")) return -toCents(amount.slice(1));
  const [whole = "0", fraction = ""] = amount.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function computeTotals(components: ComponentAmount[]) {
  let earnings = 0;
  let deductions = 0;
  for (const { type, amount } of components) {
    if (type === "DEDUCTION") deductions += toCents(amount);
    else earnings += toCents(amount);
  }
  const netCents = earnings - deductions;
  return { gross: formatCents(earnings), deductions: formatCents(deductions), net: formatCents(netCents), netCents };
}

interface Priced {
  currency: string;
  totals: { gross: string; net: string };
}

export function computeChange(prev: Priced, curr: Priced) {
  if (prev.currency !== curr.currency) return null;
  const prevGross = toCents(prev.totals.gross);
  const grossDelta = toCents(curr.totals.gross) - prevGross;
  const netDelta = toCents(curr.totals.net) - toCents(prev.totals.net);
  const percent = prevGross === 0 ? 0 : Math.round((grossDelta / prevGross) * 10000) / 100;
  return { gross: formatCents(grossDelta), net: formatCents(netDelta), grossPercent: percent.toFixed(2) };
}
