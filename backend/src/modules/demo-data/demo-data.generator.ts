import { randomUUID } from "node:crypto";

import type { SalaryComponentType } from "../../../generated/prisma/client.ts";

export const DEMO_EMAIL_DOMAIN = "demo.acme.example";
export const DEMO_TARGET = 10_000;

export const DEMO_DEPARTMENTS: Record<string, readonly (readonly [string, number])[]> = {
  Engineering: [["Software Engineer", 85], ["Senior Engineer", 120], ["Staff Engineer", 155], ["Engineering Manager", 150], ["QA Engineer", 70]],
  "Human Resources": [["HR Associate", 50], ["HR Business Partner", 80], ["Recruiter", 60], ["HR Manager", 105]],
  Finance: [["Financial Analyst", 70], ["Accountant", 62], ["Senior Analyst", 95], ["Finance Manager", 125]],
  Sales: [["Sales Representative", 55], ["Account Executive", 85], ["Sales Manager", 120], ["Customer Success Manager", 75]],
  Marketing: [["Marketing Specialist", 58], ["Content Strategist", 65], ["Brand Manager", 95], ["Growth Lead", 110]],
  Operations: [["Operations Analyst", 55], ["Operations Lead", 90], ["Logistics Coordinator", 48], ["Operations Manager", 115]],
};

// Annual base for a USD-denominated role is scaled by cost of living, then converted to the local currency.
const COUNTRIES: Record<string, { currency: string; weight: number; cost: number; fx: number }> = {
  IN: { currency: "INR", weight: 18, cost: 0.4, fx: 83 },
  US: { currency: "USD", weight: 18, cost: 1.1, fx: 1 },
  GB: { currency: "GBP", weight: 8, cost: 0.95, fx: 0.79 },
  CA: { currency: "CAD", weight: 5, cost: 0.95, fx: 1.36 },
  AU: { currency: "AUD", weight: 4, cost: 1, fx: 1.5 },
  DE: { currency: "EUR", weight: 7, cost: 0.95, fx: 0.92 },
  FR: { currency: "EUR", weight: 4, cost: 0.9, fx: 0.92 },
  SG: { currency: "SGD", weight: 4, cost: 1, fx: 1.35 },
  AE: { currency: "AED", weight: 3, cost: 0.9, fx: 3.67 },
  JP: { currency: "JPY", weight: 4, cost: 0.8, fx: 150 },
  CN: { currency: "CNY", weight: 4, cost: 0.55, fx: 7.2 },
  BR: { currency: "BRL", weight: 3, cost: 0.4, fx: 5 },
  NL: { currency: "EUR", weight: 3, cost: 0.95, fx: 0.92 },
  SE: { currency: "SEK", weight: 2, cost: 0.9, fx: 10.5 },
  CH: { currency: "CHF", weight: 2, cost: 1.3, fx: 0.88 },
  IE: { currency: "EUR", weight: 2, cost: 0.95, fx: 0.92 },
  ES: { currency: "EUR", weight: 2, cost: 0.75, fx: 0.92 },
  IT: { currency: "EUR", weight: 2, cost: 0.75, fx: 0.92 },
  MX: { currency: "MXN", weight: 2, cost: 0.4, fx: 17 },
  ZA: { currency: "ZAR", weight: 1, cost: 0.4, fx: 18.5 },
  NZ: { currency: "NZD", weight: 1, cost: 0.9, fx: 1.65 },
};

const FIRST_NAMES = [
  "Asha", "Liam", "Olivia", "Noah", "Emma", "Arjun", "Mei", "Lars", "Sofia", "Mateo", "Aisha", "Yuki", "Chloe", "Ethan",
  "Priya", "Lucas", "Hana", "Omar", "Isla", "Diego", "Zara", "Felix", "Nora", "Ravi", "Anna", "Kenji", "Leila", "Oscar",
  "Maya", "Hugo", "Ines", "Tariq", "Elena", "Jonas", "Amara", "Ivan", "Grace", "Sven", "Naomi", "Carlos",
];
const LAST_NAMES = [
  "Rao", "Smith", "Wilson", "Meyer", "Tan", "Patel", "Garcia", "Kim", "Nguyen", "Brown", "Silva", "Khan", "Rossi", "Sato",
  "Müller", "Dubois", "Ivanov", "Johnson", "Lee", "Martin", "Nair", "Walker", "Costa", "Hansen", "Okafor", "Chen",
  "Fischer", "Lopez", "Ahmed", "Novak", "Murphy", "Singh", "Bianchi", "Jensen", "Moreau", "Reddy", "Evans", "Haddad", "Kowalski", "Dlamini",
];

const REVISION_REASONS = ["Annual review", "Annual review", "Promotion", "Market adjustment"];

export interface DemoEmployee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  departmentName: string;
  designation: string;
  country: string;
  joiningDate: Date;
  status: "ACTIVE" | "INACTIVE";
}
export interface DemoSalaryRecord {
  id: string;
  employeeId: string;
  currency: string;
  effectiveDate: Date;
  reason: string;
}
export interface DemoComponent {
  salaryRecordId: string;
  type: SalaryComponentType;
  name: string;
  amount: string;
}
export interface DemoData {
  employees: DemoEmployee[];
  records: DemoSalaryRecord[];
  components: DemoComponent[];
}

/** Small deterministic PRNG (mulberry32), so the same seed always yields the same company (ids aside). */
export function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    chance: (p: number) => next() < p,
    pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)]!,
  };
}

const DAY = 86_400_000;
const utcDate = (ms: number) => new Date(Math.floor(ms / DAY) * DAY);
const money = (value: number) => value.toFixed(2);

/**
 * Builds an in-memory company: one employee per employee code, every one with a salary history and components,
 * plus a few scheduled (future) revisions, so the dashboard has nothing to flag. Pure, so it is fast to test.
 */
export function generateDemoData(
  employeeCodes: string[],
  today: Date,
  seed = 20261004,
  emailDomain = DEMO_EMAIL_DOMAIN,
): DemoData {
  const random = createRandom(seed);
  const todayMs = utcDate(today.getTime()).getTime();
  const countryCodes = Object.keys(COUNTRIES);
  const totalWeight = countryCodes.reduce((sum, code) => sum + COUNTRIES[code]!.weight, 0);
  const pickCountry = () => {
    let roll = random.next() * totalWeight;
    for (const code of countryCodes) {
      roll -= COUNTRIES[code]!.weight;
      if (roll < 0) return code;
    }
    return "US";
  };
  const departmentNames = Object.keys(DEMO_DEPARTMENTS);

  const data: DemoData = { employees: [], records: [], components: [] };

  for (const employeeCode of employeeCodes) {
    const firstName = random.pick(FIRST_NAMES);
    const lastName = random.pick(LAST_NAMES);
    const departmentName = random.pick(departmentNames);
    const [designation, usdBase] = random.pick(DEMO_DEPARTMENTS[departmentName]!);
    const country = pickCountry();
    const { currency, cost, fx } = COUNTRIES[country]!;
    const joiningMs = todayMs - random.int(60, 365 * 12) * DAY;
    const id = randomUUID(); // ids are random so re-seeding with another seed or domain can never collide

    data.employees.push({
      id,
      employeeCode,
      firstName,
      lastName,
      email: `${firstName}.${lastName}.${employeeCode.slice(4)}@${emailDomain}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""),
      phone: `+${random.int(1, 99)} ${random.int(100000000, 999999999)}`,
      departmentName,
      designation,
      country,
      joiningDate: new Date(joiningMs),
      status: random.chance(0.9) ? "ACTIVE" : "INACTIVE",
    });

    const dates = [joiningMs];
    const extra = random.int(0, 3);
    for (let i = 0; i < extra; i++) {
      const next = dates[dates.length - 1]! + random.int(180, 540) * DAY;
      if (next < todayMs) dates.push(next);
    }
    if (random.chance(0.02)) dates.push(todayMs + random.int(15, 120) * DAY); // scheduled revision

    let base = usdBase * 1000 * cost * fx * (0.85 + random.next() * 0.3);
    dates.forEach((dateMs, index) => {
      if (index > 0) base *= 1 + (random.int(3, 12) / 100);
      const rounded = Math.round(base / 100) * 100;
      const recordId = randomUUID();
      data.records.push({
        id: recordId,
        employeeId: id,
        currency,
        effectiveDate: new Date(dateMs),
        reason: index === 0 ? "Initial salary" : random.pick(REVISION_REASONS),
      });
      const add = (type: SalaryComponentType, name: string, amount: number) =>
        data.components.push({ salaryRecordId: recordId, type, name, amount: money(amount) });
      add("BASE", "Base salary", rounded);
      if (random.chance(0.7)) add("ALLOWANCE", "Housing", Math.round(rounded * 0.1));
      if (random.chance(0.3)) add("ALLOWANCE", "Transport", Math.round(rounded * 0.03));
      if (random.chance(0.4)) add("BONUS", "Performance", Math.round(rounded * (random.int(5, 15) / 100)));
      if (random.chance(0.8)) add("DEDUCTION", "Provident fund", Math.round(rounded * 0.08));
    });
  }
  return data;
}
