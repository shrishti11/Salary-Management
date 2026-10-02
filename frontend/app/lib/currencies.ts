export const CURRENCIES: { code: string; name: string }[] = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "INR", name: "Indian Rupee" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "AED", name: "UAE Dirham" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "ZAR", name: "South African Rand" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "DKK", name: "Danish Krone" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "KRW", name: "South Korean Won" },
];

/** Display only: the amount is parsed to a float, never use the result in arithmetic. */
export function formatMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(Number(amount));
}
