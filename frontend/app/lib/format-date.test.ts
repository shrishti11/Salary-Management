import { afterEach, describe, expect, it, vi } from "vitest";

import { formatDate } from "./format-date";

describe("formatDate", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("formats a YYYY-MM-DD calendar date in medium style", () => {
    expect(formatDate("2020-01-15")).toBe("Jan 15, 2020");
    expect(formatDate("2026-12-31")).toBe("Dec 31, 2026");
  });

  it("uses only the date part of a full ISO timestamp", () => {
    expect(formatDate("2024-03-01T23:30:00.000Z")).toBe("Mar 1, 2024");
  });

  it("does not shift the day with the local timezone", () => {
    // A local-midnight parse would roll 2020-01-01 back to Dec 31 west of UTC.
    vi.stubEnv("TZ", "America/Los_Angeles");
    expect(formatDate("2020-01-01")).toBe("Jan 1, 2020");
  });
});
