import type { Request, Response } from "express";

import { asOfQuerySchema, emptyQuerySchema, groupsQuerySchema, trendsQuerySchema } from "./analytics.schema.ts";
import { getDistribution, getFilterOptions, getGroups, getSummary, getTrends } from "./analytics.service.ts";
import { getDashboard } from "./dashboard.service.ts";

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

export async function filterOptionsHandler(request: Request, response: Response) {
  emptyQuerySchema.parse(request.query);
  response.status(200).json(await getFilterOptions());
}

export async function trendsHandler(request: Request, response: Response) {
  response.status(200).json(await getTrends(trendsQuerySchema.parse(request.query)));
}

export async function dashboardHandler(request: Request, response: Response) {
  emptyQuerySchema.parse(request.query);
  response.status(200).json(await getDashboard());
}
