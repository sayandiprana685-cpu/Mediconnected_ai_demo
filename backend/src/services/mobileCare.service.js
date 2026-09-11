import { Appointment, Facility, LabOrder, User } from "../models/index.js";
import { APPOINTMENT_STATUS, FACILITY_STATUS, LAB_ORDER_STATUS, PRESCRIPTION_STATUS } from "../utils/constants.js";
import { publicFacility, rankProviders } from "../utils/geo.js";
import { AppError } from "../utils/errors.js";
import { assertObjectId } from "../utils/objectId.js";
import {
  defaultPatientSnapshot,
  loadLetterheadContext,
  renderPrescriptionPdf,
  populateRx,
  snapshotLetterhead,
} from "./prescription.service.js";
import { renderLabReportPdf } from "./labReport.service.js";
import { notifyFacilityUsers } from "./notify.service.js";

// National numbers, not provider data. They are the same everywhere in India
// and are listed so the Emergency screen always has something to offer even
// before GPS resolves or when no verified hospital is nearby.
const NATIONAL_HELPLINES = [
  { code: "112", label: "National emergency (police, fire, ambulance)" },
  { code: "108", label: "Ambulance" },
  { code: "102", label: "Health helpline" },
  { code: "14416", label: "Tele-MANAS mental health support" },
];

function escape(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Emergency
// ---------------------------------------------------------------------------

/**
 * GET /api/mobile/emergency — the nearest facilities that actually declare an
 * emergency service, closest first.
 *
 * This only REPORTS options. It places no call, sends no message and records no
 * incident, so the app can never imply that help was contacted when it was not.
 */
export async function findEmergencyFacilities({ patient, query = {} }) {
  const lat = query.lat != null ? Number(query.lat) : patient?.geo?.lat;
  const lng = query.lng != null ? Number(query.lng) : patient?.geo?.lng;
  const district = query.district || patient?.district;
  const city = query.city || patient?.city;

  const filter = { status: FACILITY_STATUS.VERIFIED, emergencyAvailable: true };
  if (district) {
    // A district filter would hide the hospital 4 km away across a district
    // line, so it is only applied when there is no GPS fix to rank by.
    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
      filter.$or = [
        { district: new RegExp(`^${escape(district)}$`, "i") },
        { city: new RegExp(`^${escape(city || district)}$`, "i") },
      ];
    }
  }

  const docs = await Facility.find(filter)
    .select("name type address city district state pin geo contactNumber emergencyAvailable operatingHours description")
    .limit(300);

  const ranked = rankProviders(docs, { district, city, lat, lng })
    .map((d) => publicFacility(d, { district, city, lat, lng }))
    // With a GPS fix, distance is the only ranking that matters in an emergency.
    .sort((a, b) => {
      if (lat != null && !Number.isNaN(lat)) return (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9);
      return 0;
    })
    .slice(0, 12);

  return {
    facilities: ranked,
    total: ranked.length,
    hasLocation: lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng),
    helplines: NATIONAL_HELPLINES,
    emergencyContact: patient?.emergencyContactPhone
      ? { name: patient.emergencyContactName || "", phone: patient.emergencyContactPhone }
      : null,
    // Stated explicitly so no screen can read this response as "help is coming".
    contacted: false,
    note: "Nothing has been called or alerted. Choose a number to call it yourself.",
  };
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

function serializeAppointment(a, { facility, doctor } = {}) {
  const o = a.toObject ? a.toObject() : a;
  return {
    id: String(o._id),
    facilityId: String(o.facilityId),
    doctorUserId: String(o.doctorUserId),
    scheduledAt: o.scheduledAt,
    durationMinutes: o.durationMinutes ?? 15,
    reason: o.reason || "",
    status: o.status,
    tokenNumber: o.tokenNumber ?? null,
    notes: o.notes || "",
    completedAt: o.completedAt || null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    isUpcoming: new Date(o.scheduledAt).getTime() >= Date.now() && !["CANCELLED", "COMPLETED", "NO_SHOW"].includes(o.status),
    facility: facility
      ? { id: String(facility._id), name: facility.name, type: facility.type, city: facility.city, district: facility.district, address: facility.address, contactNumber: facility.contactNumber, geo: facility.geo || null }
      : null,
    doctor: doctor ? { id: String(doctor._id), name: doctor.name } : null,
  };
}

/** GET /api/mobile/appointments/detail — the list plus the names to show on it. */
export async function listAppointmentsDetailed(patientId) {
  const rows = await Appointment.find({ patientId }).sort({ scheduledAt: -1 }).limit(50);
  const [facilities, doctors] = await Promise.all([
    Facility.find({ _id: { $in: rows.map((r) => r.facilityId) } }).select("name type city district address contactNumber geo"),
    User.find({ _id: { $in: rows.map((r) => r.doctorUserId) } }).select("name"),
  ]);
  const facMap = Object.fromEntries(facilities.map((f) => [String(f._id), f]));
  const docMap = Object.fromEntries(doctors.map((d) => [String(d._id), d]));
  return rows.map((r) =>
    serializeAppointment(r, { facility: facMap[String(r.facilityId)], doctor: docMap[String(r.doctorUserId)] })
  );
}

/**
 * POST /api/mobile/appointments/:id/cancel
 * Refuses once the visit has started. A patient cancelling a consultation that
 * is already in progress would delete clinical work the doctor is doing.
 */
export async function cancelAppointment(patientId, id) {
  const apptId = assertObjectId(id, "appointmentId", "APPOINTMENT_INVALID");
  const appt = await Appointment.findOne({ _id: apptId, patientId });
  if (!appt) throw new AppError("That appointment was not found.", 404, "NOT_FOUND");

  const cancellable = [
    APPOINTMENT_STATUS.BOOKED,
    APPOINTMENT_STATUS.CONFIRMED,
    APPOINTMENT_STATUS.RESCHEDULED,
  ];
  if (!cancellable.includes(appt.status)) {
    throw new AppError("This appointment can no longer be cancelled. Please contact the facility.", 409, "NOT_CANCELLABLE");
  }

  appt.status = APPOINTMENT_STATUS.CANCELLED;
  appt.notes = [appt.notes, "Cancelled by the patient from the app."].filter(Boolean).join(" | ").slice(0, 500);
  await appt.save();

  // The facility must hear about this from the server, not from an empty chair.
  await notifyFacilityUsers(appt.facilityId, {
    title: "Appointment cancelled",
    body: "A patient cancelled a booked visit from the app.",
    kind: "APPOINTMENT",
    channel: "appointments",
  });

  const facility = await Facility.findById(appt.facilityId).select("name type city district address contactNumber geo");
  const doctor = await User.findById(appt.doctorUserId).select("name");
  return serializeAppointment(appt, { facility, doctor });
}

/**
 * POST /api/mobile/appointments/:id/reschedule — move a visit that has not
 * started. Only the time changes; the doctor and facility stay put, so this
 * cannot be used to jump a queue or switch doctors.
 */
export async function rescheduleAppointment(patientId, id, body) {
  const apptId = assertObjectId(id, "appointmentId", "APPOINTMENT_INVALID");
  const when = body?.scheduledAt ? new Date(body.scheduledAt) : null;
  if (!when || Number.isNaN(when.getTime())) throw new AppError("Choose a new date and time.", 422, "INVALID_TIME");
  if (when.getTime() < Date.now()) throw new AppError("Choose a time in the future.", 422, "TIME_IN_PAST");

  const appt = await Appointment.findOne({ _id: apptId, patientId });
  if (!appt) throw new AppError("That appointment was not found.", 404, "NOT_FOUND");
  if (![APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.RESCHEDULED].includes(appt.status)) {
    throw new AppError("This appointment can no longer be moved.", 409, "NOT_RESCHEDULABLE");
  }

  appt.scheduledAt = when;
  appt.status = APPOINTMENT_STATUS.RESCHEDULED;
  // The facility issued this token for the original slot, so it no longer applies.
  appt.tokenNumber = null;
  await appt.save();

  await notifyFacilityUsers(appt.facilityId, {
    title: "Appointment rescheduled",
    body: `A patient moved a visit to ${when.toISOString()}.`,
    kind: "APPOINTMENT",
    channel: "appointments",
  });

  const facility = await Facility.findById(appt.facilityId).select("name type city district address contactNumber geo");
  const doctor = await User.findById(appt.doctorUserId).select("name");
  return serializeAppointment(appt, { facility, doctor });
}

// ---------------------------------------------------------------------------
// Documents (PDF)
// ---------------------------------------------------------------------------

/** Same letterhead repair the provider portal does, so a patient's PDF matches. */
async function hydrateLetterhead(rx) {
  if (!rx.letterhead?.facilityName) {
    const ctx = await loadLetterheadContext(rx.facilityId?._id || rx.facilityId, rx.doctorUserId?._id || rx.doctorUserId);
    const snaps = snapshotLetterhead(ctx);
    rx.letterhead = snaps.letterhead;
    rx.doctorSnapshot = snaps.doctorSnapshot;
  }
  if (!rx.patientSnapshot?.name && rx.patientId) {
    rx.patientSnapshot = { ...defaultPatientSnapshot(rx.patientId), ...rx.patientSnapshot };
  }
  return rx;
}

/** GET /api/mobile/prescriptions/:id/pdf */
export async function prescriptionPdfBuffer(patientId, id) {
  const rxId = assertObjectId(id, "prescriptionId", "PRESCRIPTION_INVALID");
  const rx = await populateRx(rxId);
  // Ownership is the whole authorisation story here: a patient may download
  // their own prescription and nobody else's, whatever the facility says.
  if (!rx || String(rx.patientId?._id || rx.patientId) !== String(patientId)) {
    throw new AppError("Prescription not found.", 404, "NOT_FOUND");
  }
  if (rx.status === PRESCRIPTION_STATUS.DRAFT) {
    throw new AppError("This prescription is not ready yet.", 404, "NOT_FOUND");
  }
  await hydrateLetterhead(rx);
  const buffer = await renderPrescriptionPdf(rx);
  return { buffer, filename: `prescription-${rx.patientSnapshot?.mrn || rxId}.pdf` };
}

/** GET /api/mobile/reports/:id/pdf — the lab report, once the lab has released it. */
export async function labReportPdfBuffer(patientId, id) {
  const orderId = assertObjectId(id, "reportId", "REPORT_INVALID");
  const order = await LabOrder.findOne({ _id: orderId, patientId }).populate("patientId", "name mrn age sex");
  if (!order) throw new AppError("Report not found.", 404, "NOT_FOUND");
  if (![LAB_ORDER_STATUS.REPORT_READY, LAB_ORDER_STATUS.DELIVERED].includes(order.status)) {
    throw new AppError("The report is not ready yet.", 422, "NOT_READY");
  }
  const facility = await Facility.findById(order.facilityId);
  const buffer = await renderLabReportPdf(order, facility);
  return { buffer, filename: `lab-report-${order.testName || orderId}.pdf`.replace(/[^\w.\-]+/g, "-") };
}

