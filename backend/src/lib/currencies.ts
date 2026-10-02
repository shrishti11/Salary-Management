export const CURRENCY_CODES = [
  "USD", "EUR", "GBP", "INR", "AUD", "CAD", "SGD", "AED", "JPY", "CNY",
  "BRL", "CHF", "SEK", "NZD", "ZAR", "MXN", "NOK", "DKK", "HKD", "KRW",
] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];
