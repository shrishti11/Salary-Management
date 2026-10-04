import type { Request, Response } from "express";

import { exportSalaryDirectoryCsv, listSalaryDirectory } from "./salary.directory.service.ts";
import { createSalarySchema, employeeIdParamSchema, listDirectoryQuerySchema, salaryParamsSchema } from "./salary.schema.ts";
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

export async function listSalaryDirectoryHandler(request: Request, response: Response) {
  const query = listDirectoryQuerySchema.parse(request.query);
  response.status(200).json(await listSalaryDirectory(query));
}

export async function exportSalaryDirectoryHandler(request: Request, response: Response) {
  const query = listDirectoryQuerySchema.parse(request.query);
  const { csv } = await exportSalaryDirectoryCsv(query);
  response
    .status(200)
    .type("text/csv; charset=utf-8")
    .set("Content-Disposition", `attachment; filename="employees-${new Date().toISOString().slice(0, 10)}.csv"`)
    .send(csv);
}
