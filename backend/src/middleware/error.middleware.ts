import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  readonly statusCode: number;
  readonly code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function notFoundHandler(_request: Request, response: Response) {
  response.status(404).json({ error: { message: "Route not found" } });
}

// body-parser errors (malformed JSON, payload too large) carry a numeric 4xx status.
function getClientErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  for (const key of ["status", "statusCode"]) {
    const value = (error as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isInteger(value) && value >= 400 && value < 500) {
      return value;
    }
  }
  return undefined;
}

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  next: NextFunction,
) {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({ error: { message: "Validation failed", code: "VALIDATION_ERROR" } });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: { message: error.message, ...(error.code ? { code: error.code } : {}) },
    });
    return;
  }

  const clientErrorStatus = getClientErrorStatus(error);
  if (clientErrorStatus !== undefined) {
    response
      .status(clientErrorStatus)
      .json({ error: { message: "Invalid request body", code: "BAD_REQUEST" } });
    return;
  }

  console.error(error);
  response.status(500).json({ error: { message: "Internal server error" } });
}
