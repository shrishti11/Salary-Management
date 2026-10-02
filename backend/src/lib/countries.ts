export const COUNTRY_CODES = [
  "IN", "US", "GB", "CA", "AU", "DE", "FR", "SG", "AE", "JP",
  "CN", "BR", "NL", "SE", "CH", "IE", "ES", "IT", "MX", "ZA", "NZ",
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];
