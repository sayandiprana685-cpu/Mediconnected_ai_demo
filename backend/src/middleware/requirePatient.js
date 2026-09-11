import { Patient } from "../models/index.js";
import { AppError } from "../utils/errors.js";
import { ROLES } from "../utils/constants.js";

export async function requirePatient(req, res, next) {
  try {
    if (!req.user) throw new AppError("Authentication required.", 401, "UNAUTHENTICATED");
    if (req.user.role !== ROLES.PATIENT) {
      throw new AppError("This area is only for the patient mobile app.", 403, "FORBIDDEN");
    }
    const patient = await Patient.findOne({ userId: req.user._id });
    if (!patient) throw new AppError("Patient profile was not found.", 404, "NOT_FOUND");
    req.patient = patient;
    next();
  } catch (err) {
    next(err);
  }
}
