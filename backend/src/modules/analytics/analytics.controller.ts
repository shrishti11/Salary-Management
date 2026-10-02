import type { Request, Response } from "express";

import { asOfQuerySchema, groupsQuerySchema } from "./analytics.schema.ts";
import { getDistribution, getFilterOptions, getGroups, getSummary } from "./analytics.service.ts";

export async function summaryHandler(request: Request, response: Response) {
  const query = asOfQuerySchema.parse(request.query);
  response.status(200).json(await getSummary(query));
}

export async function distributionHandler(request: Request, response: Response) {
  response.status(200).json(await getDistribution(asOfQuerySchema.parse(request.query)));
}

export async function groupsHandler(request: Request, response: Response) {
  response.status(200).json(await getGroups(groupsQuerySchema.parse(request.query)));
}

export async function filterOptionsHandler(_request: Request, response: Response) {
  response.status(200).json(await getFilterOptions());
}
