import type { Request, Response } from "express";

import { listDepartments } from "./department.service.ts";

export async function listDepartmentsHandler(_request: Request, response: Response) {
  response.status(200).json({ departments: await listDepartments() });
}
