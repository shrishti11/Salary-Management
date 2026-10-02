export const todayUtc = () => new Date().toISOString().slice(0, 10);
export const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

/** Inclusive list of `YYYY-MM` between the months of two `YYYY-MM-DD` dates. */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const endYear = Number(to.slice(0, 4));
  const endMonth = Number(to.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/** First day of the month `count` months before the month of `date`. */
export function startOfMonthsAgo(date: string, count: number): string {
  const total = Number(date.slice(0, 4)) * 12 + (Number(date.slice(5, 7)) - 1) - count;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}
