import type { Request, Response } from "express";

import { createSalarySchema, employeeIdParamSchema, salaryParamsSchema } from "./salary.schema.ts";
import { createSalary, getSalaries, getSalary } from "./salary.service.ts";

export async function listSalariesHandler(request: Request, response: Response) {
  const { id } = employeeIdParamSchema.parse(request.params);
  response.status(200).json(await getSalaries(id));
}

export async function createSalaryHandler(request: Request, response: Response) {
  const { id } = employeeIdParamSchema.parse(request.params);
  const input = createSalarySchema.parse(request.body);
  const salary = await createSalary(id, request.user!.id, input);
  response.status(201).json({ salary });
}

export async function getSalaryHandler(request: Request, response: Response) {
  const { id, salaryId } = salaryParamsSchema.parse(request.params);
  response.status(200).json({ salary: await getSalary(id, salaryId) });
}
