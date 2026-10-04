import { formatMoney } from "~/lib/currencies";

export default function Money({ amount, currency }: { amount: string; currency: string }) {
  return <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(amount, currency)}</span>;
}
