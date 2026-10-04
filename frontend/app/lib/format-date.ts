const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/**
 * Formats a `YYYY-MM-DD` calendar date (or the date part of an ISO timestamp) as e.g. "Jan 15, 2020".
 * The date is read and formatted in UTC so it never shifts a day with the viewer's timezone.
 */
export function formatDate(value: string): string {
  return dateFormat.format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}
