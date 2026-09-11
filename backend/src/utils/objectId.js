import mongoose from "mongoose";
import { AppError } from "./errors.js";

/**
 * Guard an id that came off a URL param or a request body before it reaches a
 * query. A malformed id makes Mongoose throw a CastError, which carries no
 * status and so the shared error handler renders it as a 500 "Something went
 * wrong" - useless to a phone that just needs to know the id was bad.
 */
export function assertObjectId(value, label = "id", code = "ID_INVALID") {
  const id = String(value ?? "").trim();
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(`${label} is not a valid identifier.`, 422, code);
  }
  return id;
}

/** True when the value is a usable Mongo id, without throwing. */
export function isObjectId(value) {
  return mongoose.isValidObjectId(String(value ?? "").trim());
}
