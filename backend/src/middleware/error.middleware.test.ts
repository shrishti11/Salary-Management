import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AppError, errorHandler, notFoundHandler } from "./error.middleware";

function buildTestApp() {
  const app = express();

  app.get("/boom", () => {
    throw new AppError(422, "Invalid input", "INVALID_INPUT");
  });

  app.get("/crash", () => {
    throw new Error("unexpected failure");
  });

  app.get("/invalid", () => {
    z.object({ email: z.string().email() }).parse({ email: "nope" });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

describe("error middleware", () => {
  it("returns the AppError's status, message, and code", async () => {
    const response = await request(buildTestApp()).get("/boom");

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ error: { message: "Invalid input", code: "INVALID_INPUT" } });
  });

  it("returns 500 with a generic message for unexpected errors", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await request(buildTestApp()).get("/crash");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { message: "Internal server error" } });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("returns 400 with a generic body for zod validation errors", async () => {
    const response = await request(buildTestApp()).get("/invalid");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { message: "Validation failed", code: "VALIDATION_ERROR" },
    });
  });

  it("returns 404 for unknown routes", async () => {
    const response = await request(buildTestApp()).get("/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { message: "Route not found" } });
  });
});
