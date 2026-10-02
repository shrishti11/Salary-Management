import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env.ts";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware.ts";
import { authRouter } from "./modules/auth/auth.routes.ts";
import { departmentRouter } from "./modules/departments/department.routes.ts";
import { employeeRouter } from "./modules/employees/employee.routes.ts";
import { salaryRouter } from "./modules/salaries/salary.routes.ts";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/employees/:id/salaries", salaryRouter);
app.use("/api/employees", employeeRouter);
app.use("/api/departments", departmentRouter);

app.use(notFoundHandler);
app.use(errorHandler);
