import {
  Appointment,
  Consultation,
  DiagnosticReport,
  Facility,
  HealthTip,
  LabOrder,
  MedicalRecord,
  Prescription,
  User,
} from "../models/index.js";
import { AppError } from "../utils/errors.js";
import { PRESCRIPTION_STATUS } from "../utils/constants.js";

function own(patientId, docPatientId) {
  return String(docPatientId) === String(patientId);
}

export async function listPrescriptions(patientId) {
  const rows = await Prescription.find({
    patientId,
    status: { $in: [PRESCRIPTION_STATUS.FINALIZED, PRESCRIPTION_STATUS.REVISED] },
  })
    .sort({ createdAt: -1 })
    .limit(100);
  const facilityIds = [...new Set(rows.map((r) => String(r.facilityId)))];
  const doctorIds = [...new Set(rows.map((r) => String(r.doctorUserId)))];
  const [facilities, doctors] = await Promise.all([
    Facility.find({ _id: { $in: facilityIds } }).select("name type city district contactNumber"),
    User.find({ _id: { $in: doctorIds } }).select("name"),
  ]);
  const facMap = Object.fromEntries(facilities.map((f) => [String(f._id), f]));
  const docMap = Object.fromEntries(doctors.map((d) => [String(d._id), d]));
  return rows.map((r) => serializePrescription(r, facMap[String(r.facilityId)], docMap[String(r.doctorUserId)]));
}

export async function getPrescription(patientId, id) {
  const row = await Prescription.findById(id);
  if (!row || !own(patientId, row.patientId)) {
    throw new AppError("Prescription not found.", 404, "NOT_FOUND");
  }
  if (row.status === PRESCRIPTION_STATUS.DRAFT) {
    throw new AppError("This prescription is not ready yet.", 404, "NOT_FOUND");
  }
  const [facility, doctor] = await Promise.all([
    Facility.findById(row.facilityId).select("name type city district contactNumber address"),
    User.findById(row.doctorUserId).select("name"),
  ]);
  return serializePrescription(row, facility, doctor);
}

function serializePrescription(r, facility, doctor) {
  const o = r.toObject();
  return {
    id: String(o._id),
    status: o.status,
    issuedAt: o.issuedAt || o.finalizedAt || o.createdAt,
    createdAt: o.createdAt,
    medicines: o.medicines?.length ? o.medicines : o.items || [],
    investigations: o.investigations || [],
    adviceItems: o.adviceItems || [],
    advice: o.advice,
    diagnosis: o.diagnosis,
    chiefComplaint: o.chiefComplaint,
    followUpDate: o.followUpDate,
    doctor: {
      name: o.doctorSnapshot?.name || doctor?.name,
      qualification: o.doctorSnapshot?.qualification,
      registrationNumber: o.doctorSnapshot?.registrationNumber,
      specialization: o.doctorSnapshot?.specialization,
    },
    facility: {
      id: String(o.facilityId),
      name: o.letterhead?.facilityName || facility?.name,
      type: facility?.type,
      city: o.letterhead?.city || facility?.city,
      district: facility?.district,
      contactNumber: o.letterhead?.phone || facility?.contactNumber,
    },
    patientSnapshot: o.patientSnapshot,
  };
}

export async function listReports(patientId, category) {
  const labFilter = { patientId };
  if (category === "LABORATORY" || category === "DIAGNOSTIC") {
    /* still all lab orders for this patient */
  }
  const [labs, diagnostics, records] = await Promise.all([
    LabOrder.find(labFilter).sort({ createdAt: -1 }).limit(80),
    DiagnosticReport.find({ patientId }).sort({ createdAt: -1 }).limit(80),
    MedicalRecord.find({ patientId }).sort({ createdAt: -1 }).limit(80),
  ]);
  const facIds = [
    ...labs.map((l) => l.facilityId),
    ...diagnostics.map((d) => d.facilityId),
    ...records.map((r) => r.facilityId),
  ];
  const facilities = await Facility.find({ _id: { $in: facIds } }).select("name type city district");
  const facMap = Object.fromEntries(facilities.map((f) => [String(f._id), f]));

  const labRows = labs.map((l) => ({
    id: String(l._id),
    category: mapFacilityReportCategory(facMap[String(l.facilityId)]?.type) || "LABORATORY",
    title: l.testName,
    status: l.status,
    date: l.reportDate || l.reportReadyAt || l.createdAt,
    facility: facMap[String(l.facilityId)] || null,
    summary: l.remarks || "",
    results: l.results || [],
    kind: "lab_order",
  }));
  const diagRows = diagnostics.map((d) => ({
    id: String(d._id),
    category: "DIAGNOSTIC",
    title: d.testName || "Diagnostic report",
    status: d.status,
    date: d.resultAt || d.createdAt,
    facility: facMap[String(d.facilityId)] || null,
    summary: d.summary || "",
    kind: "diagnostic_report",
  }));
  const recRows = records.map((r) => ({
    id: String(r._id),
    category: mapFacilityReportCategory(facMap[String(r.facilityId)]?.type) || "CLINIC",
    title: r.title || r.kind,
    status: "READY",
    date: r.createdAt,
    facility: facMap[String(r.facilityId)] || null,
    summary: r.body || "",
    kind: "medical_record",
  }));

  let all = [...labRows, ...diagRows, ...recRows].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (category && category !== "ALL") {
    all = all.filter((r) => r.category === category);
  }
  return all;
}

export async function getReport(patientId, id, kind) {
  if (kind === "lab_order") {
    const l = await LabOrder.findById(id);
    if (!l || !own(patientId, l.patientId)) throw new AppError("Report not found.", 404, "NOT_FOUND");
    const facility = await Facility.findById(l.facilityId).select("name type city district");
    return { kind, report: l, facility };
  }
  if (kind === "diagnostic_report") {
    const d = await DiagnosticReport.findById(id);
    if (!d || !own(patientId, d.patientId)) throw new AppError("Report not found.", 404, "NOT_FOUND");
    const facility = await Facility.findById(d.facilityId).select("name type city district");
    return { kind, report: d, facility };
  }
  const r = await MedicalRecord.findById(id);
  if (!r || !own(patientId, r.patientId)) throw new AppError("Report not found.", 404, "NOT_FOUND");
  const facility = await Facility.findById(r.facilityId).select("name type city district");
  return { kind: "medical_record", report: r, facility };
}

function mapFacilityReportCategory(type) {
  if (type === "HOSPITAL") return "HOSPITAL";
  if (type === "NURSING_HOME") return "NURSING_HOME";
  if (type === "CLINIC") return "CLINIC";
  if (type === "LABORATORY") return "LABORATORY";
  if (type === "DIAGNOSTIC_CENTRE") return "DIAGNOSTIC";
  return null;
}

export async function listAppointments(patientId) {
  return Appointment.find({ patientId }).sort({ scheduledAt: -1 }).limit(50);
}

export async function listHealthRecords(patientId) {
  const [prescriptions, reports, appointments, consultations] = await Promise.all([
    listPrescriptions(patientId),
    listReports(patientId),
    listAppointments(patientId),
    Consultation.find({ patientId }).sort({ createdAt: -1 }).limit(50),
  ]);
  return { prescriptions, reports, appointments, consultations };
}

export async function listHealthTips() {
  const tips = await HealthTip.find({ active: true, locale: "en" }).sort({ sort: 1, createdAt: -1 }).limit(10);
  if (tips.length) return tips;
  return bundledTips();
}

function bundledTips() {
  return [
    { _id: "t1", title: "Drink clean water", body: "Use boiled or filtered water. Clean water helps prevent stomach infections." },
    { _id: "t2", title: "Wash your hands", body: "Wash with soap before eating and after using the toilet to stop germs from spreading." },
    { _id: "t3", title: "Rest when you have fever", body: "Drink fluids and rest. If fever is high or lasts more than 3 days, see a doctor." },
    { _id: "t4", title: "Keep medicines safe", body: "Store medicines in a cool, dry place, away from children. Do not share leftover antibiotics." },
  ];
}

export async function updatePatientLocation(patient, body) {
  const fields = ["city", "district", "state", "pin", "address", "country"];
  for (const f of fields) {
    if (body[f] != null) patient[f] = String(body[f]).trim();
  }
  if (body.lat != null && body.lng != null) {
    patient.geo = { lat: Number(body.lat), lng: Number(body.lng) };
  }
  if (body.locationSource) patient.locationSource = body.locationSource;
  await patient.save();
  return patient;
}

export async function updatePatientProfile(user, patient, body) {
  if (body.name) {
    const name = String(body.name).trim();
    if (name.length >= 2) {
      user.name = name;
      patient.name = name;
    }
  }
  if (body.sex && ["Female", "Male", "Other"].includes(body.sex)) patient.sex = body.sex;
  if (body.dateOfBirth) patient.dateOfBirth = new Date(body.dateOfBirth);
  if (body.address != null) patient.address = String(body.address).trim();
  if (body.emergencyContactName != null) patient.emergencyContactName = String(body.emergencyContactName).trim();
  if (body.emergencyContactPhone != null) patient.emergencyContactPhone = String(body.emergencyContactPhone).trim();
  if (body.languagePreference) {
    patient.languagePreference = body.languagePreference;
    user.preferredLanguage = body.languagePreference;
  }
  if (body.bloodGroup != null) patient.bloodGroup = String(body.bloodGroup).trim();
  if (Array.isArray(body.allergies)) {
    patient.allergies = body.allergies.map((s) => String(s).trim()).filter(Boolean);
  } else if (typeof body.allergies === "string") {
    patient.allergies = body.allergies.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (typeof body.notificationPrefs === "object") {
    user.notificationPrefs = { ...user.notificationPrefs?.toObject?.(), ...body.notificationPrefs };
  }
  await user.save();
  await patient.save();
  return { user, patient };
}
