import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  const message =
    err instanceof AppError || status < 500
      ? err.message
      : "Something went wrong. Please try again.";
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: message,
    code: err.code || "ERROR",
    ...(env.node === "development" && status >= 500 ? { debug: err.message } : {}),
  });
}

export function notFound(req, res) {
  res.status(404).json({ error: "This endpoint does not exist.", code: "NOT_FOUND" });
}
