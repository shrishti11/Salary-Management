import type { Request, Response } from "express";

import { getDemoDataStatus, seedDemoData } from "./demo-data.service.ts";

export async function getDemoDataStatusHandler(_request: Request, response: Response) {
  response.status(200).json(await getDemoDataStatus());
}

export async function seedDemoDataHandler(request: Request, response: Response) {
  const result = await seedDemoData(request.user!.id);
  response.status(result.created ? 201 : 200).json(result);
}
