import {
  Appointment,
  Consultation,
  Facility,
  FacilityDoctor,
  LabOrder,
  Patient,
  PharmacyFulfillment,
} from "../models/index.js";
import { isDiagnosticType, isPharmacyType, ROLES } from "../utils/constants.js";
import { AppError } from "../utils/errors.js";

export async function assertPatientAccess(req, patientId) {
  if (req.user.role === ROLES.MAIN_ADMIN) {
    throw new AppError(
      "Government administrators do not have routine access to individual medical records.",
      403,
      "MIN_NECESSARY"
    );
  }
  const facility = req.facilityId ? await Facility.findById(req.facilityId).select("type") : null;
  const patient = await Patient.findById(patientId).select("homeFacilityId");
  const home = patient?.homeFacilityId && String(patient.homeFacilityId) === String(req.facilityId);

  if (isDiagnosticType(facility?.type)) {
    if (home) return;
    const hit = await LabOrder.exists({ patientId, facilityId: req.facilityId });
    if (!hit) throw new AppError("This patient is not in your laboratory workflow.", 403, "FORBIDDEN");
    return;
  }
  if (isPharmacyType(facility?.type)) {
    if (home) return;
    const hit = await PharmacyFulfillment.exists({ patientId, facilityId: req.facilityId });
    if (!hit) throw new AppError("This patient is not in your pharmacy workflow.", 403, "FORBIDDEN");
    return;
  }

  if (req.user.role === ROLES.FACILITY_ADMIN) {
    const hit = await Appointment.exists({
      patientId,
      facilityId: req.user.facilityId,
    });
    if (!hit) {
      const consult = await Consultation.exists({
        patientId,
        facilityId: req.user.facilityId,
      });
      if (!consult) {
        throw new AppError("This patient is not in your facility workflow.", 403, "FORBIDDEN");
      }
    }
    return;
  }
  if (req.user.role === ROLES.DOCTOR) {
    const facilityId = req.facilityId;
    const linked = await FacilityDoctor.exists({
      userId: req.user._id,
      facilityId,
      status: "ACTIVE",
    });
    if (!linked) throw new AppError("You are not linked to this facility.", 403, "FORBIDDEN");
    const hit = await Appointment.exists({
      patientId,
      doctorUserId: req.user._id,
      facilityId,
    });
    if (!hit) {
      const consult = await Consultation.exists({
        patientId,
        doctorUserId: req.user._id,
        facilityId,
      });
      if (!consult) {
        throw new AppError("You are not assigned to this patient at the selected facility.", 403, "FORBIDDEN");
      }
    }
  }
}
