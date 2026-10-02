import type { Request, Response } from "express";

import {
  createEmployeeSchema,
  idParamSchema,
  listEmployeesQuerySchema,
  statusSchema,
  updateEmployeeSchema,
} from "./employee.schema.ts";
import {
  createEmployee,
  getEmployee,
  listEmployees,
  setEmployeeStatus,
  updateEmployee,
} from "./employee.service.ts";

export async function createEmployeeHandler(request: Request, response: Response) {
  const input = createEmployeeSchema.parse(request.body);
  const employee = await createEmployee(input);
  response.status(201).json({ employee });
}

export async function getEmployeeHandler(request: Request, response: Response) {
  const { id } = idParamSchema.parse(request.params);
  response.status(200).json({ employee: await getEmployee(id) });
}

export async function updateEmployeeHandler(request: Request, response: Response) {
  const { id } = idParamSchema.parse(request.params);
  const input = updateEmployeeSchema.parse(request.body);
  response.status(200).json({ employee: await updateEmployee(id, input) });
}

export async function setEmployeeStatusHandler(request: Request, response: Response) {
  const { id } = idParamSchema.parse(request.params);
  const { status } = statusSchema.parse(request.body);
  response.status(200).json({ employee: await setEmployeeStatus(id, status) });
}

export async function listEmployeesHandler(request: Request, response: Response) {
  const query = listEmployeesQuerySchema.parse(request.query);
  response.status(200).json(await listEmployees(query));
}
