import type { Request, Response } from "express";

import { asOfQuerySchema } from "./analytics.schema.ts";
import { getSummary } from "./analytics.service.ts";

export async function summaryHandler(request: Request, response: Response) {
  const query = asOfQuerySchema.parse(request.query);
  response.status(200).json(await getSummary(query));
}
