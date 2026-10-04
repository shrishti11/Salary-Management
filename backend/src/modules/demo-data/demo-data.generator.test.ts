import { describe, expect, it } from "vitest";

import { COUNTRY_CODES } from "../../lib/countries";
import { CURRENCY_CODES } from "../../lib/currencies";
import { DEMO_DEPARTMENTS, DEMO_EMAIL_DOMAIN, createRandom, generateDemoData } from "./demo-data.generator";

const TODAY = new Date("2026-10-04T00:00:00.000Z");
const codes = (n: number) => Array.from({ length: n }, (_, i) => `EMP-${String(i + 1).padStart(5, "0")}`);

describe("createRandom", () => {
  it("is deterministic per seed", () => {
    const a = createRandom(1);
    const b = createRandom(1);
    expect([a.next(), a.int(1, 100)]).toEqual([b.next(), b.int(1, 100)]);
    expect(createRandom(2).next()).not.toBe(createRandom(1).next());
  });

});

describe("generateDemoData", () => {
  const data = generateDemoData(codes(2000), TODAY);

  it("is deterministic", () => {
    const again = generateDemoData(codes(2000), TODAY);
    const withoutId = ({ id: _id, ...rest }: (typeof data.employees)[number]) => rest;
    expect(again.employees.slice(0, 50).map(withoutId)).toEqual(data.employees.slice(0, 50).map(withoutId));
    expect(again.components.length).toBe(data.components.length);
  });

  it("creates one employee per code with unique ids and emails on the demo domain", () => {
    expect(data.employees).toHaveLength(2000);
    expect(new Set(data.employees.map((e) => e.id)).size).toBe(2000);
    expect(new Set(data.employees.map((e) => e.email)).size).toBe(2000);
    expect(data.employees.every((e) => e.email.endsWith(`@${DEMO_EMAIL_DOMAIN}`) && /^[\x20-\x7e]+$/.test(e.email))).toBe(true);
  });

  it("uses only supported countries, currencies, departments and designations", () => {
    for (const e of data.employees) {
      expect(COUNTRY_CODES).toContain(e.country);
      const roles = DEMO_DEPARTMENTS[e.departmentName]!.map(([name]) => name);
      expect(roles).toContain(e.designation);
    }
    for (const r of data.records) expect(CURRENCY_CODES).toContain(r.currency);
  });

  it("never joins in the future and mixes active and inactive", () => {
    expect(data.employees.every((e) => e.joiningDate.getTime() < TODAY.getTime())).toBe(true);
    const inactive = data.employees.filter((e) => e.status === "INACTIVE").length / 2000;
    expect(inactive).toBeGreaterThan(0.05);
    expect(inactive).toBeLessThan(0.15);
  });

  it("leaves a few employees without salary and gives the rest a first record on the joining date", () => {
    const withRecords = new Set(data.records.map((r) => r.employeeId));
    const without = data.employees.filter((e) => !withRecords.has(e.id)).length / 2000;
    expect(without).toBeGreaterThan(0.01);
    expect(without).toBeLessThan(0.06);
    for (const e of data.employees.filter((x) => withRecords.has(x.id))) {
      const mine = data.records.filter((r) => r.employeeId === e.id).sort((a, b) => +a.effectiveDate - +b.effectiveDate);
      expect(mine[0]!.effectiveDate.getTime()).toBe(e.joiningDate.getTime());
      expect(mine[0]!.reason).toBe("Initial salary");
      expect(new Set(mine.map((r) => +r.effectiveDate)).size).toBe(mine.length); // @@unique(employeeId, effectiveDate)
      expect(new Set(mine.map((r) => r.currency)).size).toBe(1);
    }
  });

  it("includes some scheduled (future) revisions", () => {
    expect(data.records.some((r) => r.effectiveDate.getTime() > TODAY.getTime())).toBe(true);
  });

  it("gives every record exactly one base component, unique component names, and positive amounts", () => {
    const byRecord = new Map<string, typeof data.components>();
    for (const c of data.components) byRecord.set(c.salaryRecordId, [...(byRecord.get(c.salaryRecordId) ?? []), c]);
    expect(byRecord.size).toBe(data.records.length);
    for (const comps of byRecord.values()) {
      expect(comps.filter((c) => c.type === "BASE")).toHaveLength(1);
      expect(new Set(comps.map((c) => `${c.type}:${c.name}`)).size).toBe(comps.length);
      expect(comps.every((c) => Number(c.amount) > 0)).toBe(true);
    }
  });
});
