import { apiCall } from "~/lib/employees-api";

export interface DemoDataStatus {
  seeded: boolean;
  count: number;
  target: number;
}

export interface DemoDataSeedResult extends DemoDataStatus {
  created: boolean;
  durationMs: number;
}

export function getDemoDataStatus(request: Request) {
  return apiCall<DemoDataStatus>(request, "/api/demo-data");
}

export function seedDemoData(request: Request) {
  return apiCall<DemoDataSeedResult>(request, "/api/demo-data/seed", { method: "POST" });
}

export function reseedDemoData(request: Request) {
  return apiCall<DemoDataSeedResult>(request, "/api/demo-data/reseed", { method: "POST" });
}
