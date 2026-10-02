import { describe, expect, it } from "vitest";

import { computeChange, computeTotals, formatCents, toCents } from "./salary.calc.ts";

describe("toCents / formatCents", () => {
  it("parses whole and fractional amounts exactly", () => {
    expect(toCents("5000")).toBe(500000);
    expect(toCents("5000.5")).toBe(500050);
    expect(toCents("0.10")).toBe(10);
    expect(toCents("0.1") + toCents("0.2")).toBe(30);
  });
  it("parses negative amounts", () => {
    expect(toCents("-12.50")).toBe(-1250);
  });
  it("formats with two decimals and a sign", () => {
    expect(formatCents(500050)).toBe("5000.50");
    expect(formatCents(5)).toBe("0.05");
    expect(formatCents(-1250)).toBe("-12.50");
  });
});

describe("computeTotals", () => {
  it("adds base, allowances and bonuses and subtracts deductions", () => {
    const totals = computeTotals([
      { type: "BASE", amount: "1000.00" },
      { type: "ALLOWANCE", amount: "200.10" },
      { type: "BONUS", amount: "99.90" },
      { type: "DEDUCTION", amount: "300.00" },
    ]);
    expect(totals).toEqual({ gross: "1300.00", deductions: "300.00", net: "1000.00", netCents: 100000 });
  });
  it("reports a negative net", () => {
    const totals = computeTotals([{ type: "BASE", amount: "10" }, { type: "DEDUCTION", amount: "10.01" }]);
    expect(totals.netCents).toBe(-1);
  });
});

describe("computeChange", () => {
  const prev = { currency: "USD", totals: { gross: "1000.00", net: "900.00" } };
  it("returns differences and gross percent", () => {
    expect(computeChange(prev, { currency: "USD", totals: { gross: "1100.00", net: "950.00" } })).toEqual({
      gross: "100.00",
      net: "50.00",
      grossPercent: "10.00",
    });
  });
  it("handles decreases", () => {
    expect(computeChange(prev, { currency: "USD", totals: { gross: "900.00", net: "800.00" } })?.gross).toBe("-100.00");
  });
  it("is null across currencies", () => {
    expect(computeChange(prev, { currency: "EUR", totals: { gross: "1100.00", net: "950.00" } })).toBeNull();
  });
});
