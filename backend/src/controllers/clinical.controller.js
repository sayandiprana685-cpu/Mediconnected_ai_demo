import {
  Appointment,
  Consultation,
  DiagnosticReport,
  FollowUp,
  LabOrder,
  MedicalRecord,
  Patient,
  PharmacyFulfillment,
  Prescription,
  Queue,
  Referral,
  Facility,
  User,
} from "../models/index.js";
import { APPOINTMENT_STATUS, PRESCRIPTION_STATUS, REFERRAL_STATUS, isDiagnosticType, isPharmacyType } from "../utils/constants.js";
import { AppError, asyncHandler } from "../utils/errors.js";
import { writeAudit } from "../services/audit.service.js";
import { sendReferralNotice, sendAppointmentNotice } from "../services/email.service.js";
import { notifyUser, ifEmailAllowed } from "../services/notify.service.js";
import { assertPatientAccess } from "../middleware/patientAccess.js";
import { ROLES } from "../utils/constants.js";
import { startOfDayTz, endOfDayTz, todayKey } from "../utils/time.js";
import {
  adviceFromBody,
  applyClinicalBody,
  assertCanViewPrescription,
  assertCanWritePrescription,
  defaultPatientSnapshot,
  documentFromPrescription,
  itemsFromMedicines,
  loadLetterheadContext,
  medicinesFromBody,
  populateRx,
  renderPrescriptionPdf,
  snapshotLetterhead,
} from "../services/prescription.service.js";

function doctorFilter(req) {
  const q = { facilityId: req.facilityId };
  if (req.user.role === ROLES.DOCTOR) q.doctorUserId = req.user._id;
  return q;
}

async function markAppointmentCompleted(req, appt) {
  if (appt.status === APPOINTMENT_STATUS.COMPLETED) return;
  appt.status = APPOINTMENT_STATUS.COMPLETED;
  appt.completedAt = new Date();
  appt.completedBy = req.user._id;
  await appt.save();
  await Queue.findOneAndUpdate({ appointmentId: appt._id }, { status: APPOINTMENT_STATUS.COMPLETED });
  await Consultation.updateMany(
    { appointmentId: appt._id, status: "IN_PROGRESS" },
    { status: "COMPLETED", completedAt: new Date() }
  );
  await writeAudit(req, {
    action: "APPOINTMENT_COMPLETED",
    resource: "Appointment",
    resourceId: appt._id,
    facilityId: appt.facilityId,
  });
}

async function hydrateDocument(rx) {
  if (!rx.letterhead?.facilityName) {
    const ctx = await loadLetterheadContext(rx.facilityId?._id || rx.facilityId, rx.doctorUserId?._id || rx.doctorUserId);
    const snaps = snapshotLetterhead(ctx);
    rx.letterhead = snaps.letterhead;
    rx.doctorSnapshot = snaps.doctorSnapshot;
  }
  if (!rx.patientSnapshot?.name && rx.patientId) {
    rx.patientSnapshot = { ...defaultPatientSnapshot(rx.patientId), ...rx.patientSnapshot };
  }
}

export const clinicalController = {
  patients: asyncHandler(async (req, res) => {
    const q = doctorFilter(req);
    const appts = await Appointment.find(q).select("patientId").lean();
    const consults = await Consultation.find(q).select("patientId").lean();
    const lab = await LabOrder.find({ facilityId: req.facilityId }).select("patientId").lean();
    const pharm = await PharmacyFulfillment.find({ facilityId: req.facilityId }).select("patientId").lean();
    const ids = [...new Set([...appts, ...consults, ...lab, ...pharm].map((x) => String(x.patientId)))];
    const filter =
      req.user.role === ROLES.FACILITY_ADMIN || [ROLES.LAB_TECH, ROLES.LAB_REVIEWER, ROLES.PHARMACIST, ROLES.PHARMACY_STAFF].includes(req.user.role)
        ? { $or: [{ homeFacilityId: req.facilityId }, { _id: { $in: ids } }] }
        : { _id: { $in: ids } };
    const patients = await Patient.find(filter).sort({ name: 1 });
    res.json({ patients });
  }),

  createPatient: asyncHandler(async (req, res) => {
    const count = await Patient.countDocuments();
    const mrn = `MC-${String(count + 1).padStart(6, "0")}`;
    const patient = await Patient.create({
      ...req.body,
      mrn,
      homeFacilityId: req.facilityId,
    });
    res.status(201).json({ patient });
  }),

  patientOne: asyncHandler(async (req, res) => {
    await assertPatientAccess(req, req.params.id);
    const facility = await Facility.findById(req.facilityId).select("type");
    const patient = await Patient.findById(req.params.id);
    if (!patient) throw new AppError("Patient not found.", 404, "NOT_FOUND");
    if (isDiagnosticType(facility?.type)) {
      const orders = await LabOrder.find({ patientId: patient._id, facilityId: req.facilityId }).sort({ createdAt: -1 });
      await writeAudit(req, { action: "PATIENT_VIEW", resource: "Patient", resourceId: patient._id, facilityId: req.facilityId });
      return res.json({ patient, access: "DIAGNOSTIC", orders, records: [], diagnostics: orders, prescriptions: [] });
    }
    if (isPharmacyType(facility?.type)) {
      const orders = await PharmacyFulfillment.find({ patientId: patient._id, facilityId: req.facilityId }).sort({ createdAt: -1 });
      await writeAudit(req, { action: "PATIENT_VIEW", resource: "Patient", resourceId: patient._id, facilityId: req.facilityId });
      return res.json({
        patient: {
          _id: patient._id,
          name: patient.name,
          mrn: patient.mrn,
          age: patient.age,
          sex: patient.sex,
          allergies: patient.allergies,
          phone: patient.phone,
        },
        access: "PHARMACY",
        orders,
        records: [],
        diagnostics: [],
        prescriptions: [],
      });
    }
    const records = await MedicalRecord.find({ patientId: patient._id, facilityId: req.facilityId }).sort({ createdAt: -1 });
    const diagnostics = await DiagnosticReport.find({ patientId: patient._id, facilityId: req.facilityId }).sort({ createdAt: -1 });
    const prescriptions = await Prescription.find({ patientId: patient._id, facilityId: req.facilityId }).sort({ createdAt: -1 });
    await writeAudit(req, { action: "PATIENT_VIEW", resource: "Patient", resourceId: patient._id, facilityId: req.facilityId });
    res.json({ patient, records, diagnostics, prescriptions });
  }),

  appointments: asyncHandler(async (req, res) => {
    const q = doctorFilter(req);
    if (req.query.date) {
      const d = new Date(req.query.date);
      q.scheduledAt = { $gte: startOfDayTz(d), $lte: endOfDayTz(d) };
    }
    if (req.query.status) q.status = req.query.status;
    const items = await Appointment.find(q)
      .populate("patientId", "name age sex mrn")
      .populate("doctorUserId", "name")
      .sort({ scheduledAt: 1 });
    res.json({ appointments: items });
  }),

  createAppointment: asyncHandler(async (req, res) => {
    const doctorUserId = req.user.role === ROLES.DOCTOR ? req.user._id : req.body.doctorUserId;
    const clash = await Appointment.findOne({
      doctorUserId,
      facilityId: req.facilityId,
      scheduledAt: new Date(req.body.scheduledAt),
      status: { $nin: [APPOINTMENT_STATUS.CANCELLED, APPOINTMENT_STATUS.NO_SHOW] },
    });
    if (clash) throw new AppError("Appointment slot is no longer available.", 409, "SLOT_TAKEN");
    const facility = await Facility.findById(req.facilityId).select("appointmentSlotMinutes name");
    const durationMinutes = req.body.durationMinutes || facility?.appointmentSlotMinutes || 15;
    const appt = await Appointment.create({
      facilityId: req.facilityId,
      doctorUserId,
      patientId: req.body.patientId,
      departmentId: req.body.departmentId,
      scheduledAt: req.body.scheduledAt,
      durationMinutes,
      reason: req.body.reason,
      status: APPOINTMENT_STATUS.BOOKED,
    });
    const doctor = await User.findById(doctorUserId);
    const patient = await Patient.findById(req.body.patientId).select("name");
    await notifyUser(doctor, {
      title: "New appointment",
      body: `${patient?.name || "A patient"} is booked at ${facility?.name || "your facility"}.`,
      kind: "APPOINTMENT",
      channel: "appointments",
    });
    await ifEmailAllowed(doctor, () =>
      sendAppointmentNotice(doctor.email, `Appointment booked for ${patient?.name || "a patient"} at ${facility?.name || "your facility"}.`)
    );
    res.status(201).json({ appointment: appt });
  }),

  updateAppointment: asyncHandler(async (req, res) => {
    const appt = await Appointment.findOne({ _id: req.params.id, ...doctorFilter(req) });
    if (!appt) throw new AppError("Appointment not found.", 404, "NOT_FOUND");
    if (req.body.status === APPOINTMENT_STATUS.COMPLETED) {
      if (req.user.role !== ROLES.DOCTOR || String(appt.doctorUserId) !== String(req.user._id)) {
        throw new AppError("Only the assigned doctor can complete this appointment.", 403, "FORBIDDEN");
      }
      await markAppointmentCompleted(req, appt);
      return res.json({ appointment: appt });
    }
    if (req.body.status) appt.status = req.body.status;
    if (req.body.scheduledAt) {
      appt.scheduledAt = req.body.scheduledAt;
      if (req.body.status !== APPOINTMENT_STATUS.RESCHEDULED) appt.status = APPOINTMENT_STATUS.RESCHEDULED;
    }
    await appt.save();
    await writeAudit(req, { action: "APPOINTMENT_UPDATE", resource: "Appointment", resourceId: appt._id, facilityId: req.facilityId });
    res.json({ appointment: appt });
  }),

  completeAppointment: asyncHandler(async (req, res) => {
    const appt = await Appointment.findById(req.params.id).populate("patientId", "name mrn");
    if (!appt) throw new AppError("Appointment not found.", 404, "NOT_FOUND");
    if (String(appt.facilityId) !== String(req.facilityId)) {
      throw new AppError("This appointment belongs to another facility.", 403, "FORBIDDEN");
    }
    if (String(appt.doctorUserId) !== String(req.user._id)) {
      throw new AppError("You can only complete your own appointments.", 403, "FORBIDDEN");
    }
    if (appt.status === APPOINTMENT_STATUS.COMPLETED) {
      throw new AppError("This consultation is already completed.", 409, "ALREADY_COMPLETED");
    }
    if ([APPOINTMENT_STATUS.CANCELLED, APPOINTMENT_STATUS.NO_SHOW].includes(appt.status)) {
      throw new AppError("A cancelled or no-show appointment cannot be completed.", 409, "INVALID_STATUS");
    }
    await markAppointmentCompleted(req, appt);
    const updated = await Appointment.findById(appt._id).populate("patientId", "name mrn age sex").populate("doctorUserId", "name");
    res.json({ appointment: updated, message: "Consultation completed successfully." });
  }),

  queue: asyncHandler(async (req, res) => {
    const q = { facilityId: req.facilityId, dateKey: req.query.date || todayKey() };
    if (req.user.role === ROLES.DOCTOR) q.doctorUserId = req.user._id;
    const items = await Queue.find(q)
      .populate("patientId", "name age sex mrn")
      .populate("appointmentId")
      .populate("doctorUserId", "name")
      .sort({ tokenNumber: 1 });
    const active = items.filter((i) =>
      [APPOINTMENT_STATUS.CHECKED_IN, APPOINTMENT_STATUS.WAITING, APPOINTMENT_STATUS.IN_CONSULTATION].includes(i.status)
    );
    const completed = items.filter((i) => i.status === APPOINTMENT_STATUS.COMPLETED);
    res.json({ queue: active, completed, all: items });
  }),

  checkIn: asyncHandler(async (req, res) => {
    const appt = await Appointment.findOne({ _id: req.params.id, facilityId: req.facilityId });
    if (!appt) throw new AppError("Appointment not found.", 404, "NOT_FOUND");
    const dateKey = todayKey(appt.scheduledAt);
    const last = await Queue.findOne({ facilityId: req.facilityId, dateKey }).sort({ tokenNumber: -1 });
    const tokenNumber = (last?.tokenNumber || 100) + 1;
    appt.status = APPOINTMENT_STATUS.WAITING;
    appt.tokenNumber = tokenNumber;
    await appt.save();
    const entry = await Queue.findOneAndUpdate(
      { appointmentId: appt._id },
      {
        facilityId: req.facilityId,
        doctorUserId: appt.doctorUserId,
        appointmentId: appt._id,
        patientId: appt.patientId,
        dateKey,
        tokenNumber,
        status: APPOINTMENT_STATUS.WAITING,
      },
      { upsert: true, new: true }
    );
    res.json({ queue: entry, appointment: appt });
  }),

  updateQueue: asyncHandler(async (req, res) => {
    const entry = await Queue.findOne({ _id: req.params.id, facilityId: req.facilityId });
    if (!entry) throw new AppError("Queue item not found.", 404, "NOT_FOUND");
    if (req.user.role === ROLES.DOCTOR && String(entry.doctorUserId) !== String(req.user._id)) {
      throw new AppError("You can only update your own queue.", 403, "FORBIDDEN");
    }
    entry.status = req.body.status;
    await entry.save();
    await Appointment.findByIdAndUpdate(entry.appointmentId, { status: req.body.status });
    res.json({ queue: entry });
  }),

  startConsultation: asyncHandler(async (req, res) => {
    const appt = await Appointment.findOne({ _id: req.body.appointmentId, ...doctorFilter(req) });
    if (!appt) throw new AppError("Appointment not found.", 404, "NOT_FOUND");
    if (String(appt.doctorUserId) !== String(req.user._id)) {
      throw new AppError("You can only start your own appointments.", 403, "FORBIDDEN");
    }
    if (appt.status === APPOINTMENT_STATUS.COMPLETED) {
      throw new AppError("This consultation is already completed.", 409, "ALREADY_COMPLETED");
    }
    appt.status = APPOINTMENT_STATUS.IN_CONSULTATION;
    await appt.save();
    await Queue.findOneAndUpdate({ appointmentId: appt._id }, { status: APPOINTMENT_STATUS.IN_CONSULTATION });
    let consultation = await Consultation.findOne({ appointmentId: appt._id, status: "IN_PROGRESS" });
    if (!consultation) {
      consultation = await Consultation.create({
        facilityId: req.facilityId,
        doctorUserId: appt.doctorUserId,
        patientId: appt.patientId,
        appointmentId: appt._id,
        chiefComplaint: req.body.chiefComplaint || appt.reason,
        status: "IN_PROGRESS",
      });
      await writeAudit(req, { action: "CONSULTATION_CREATE", resource: "Consultation", resourceId: consultation._id, facilityId: req.facilityId });
    }
    res.status(201).json({ consultation });
  }),

  consultations: asyncHandler(async (req, res) => {
    const items = await Consultation.find(doctorFilter(req))
      .populate("patientId", "name mrn age sex")
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ consultations: items });
  }),

  saveConsultation: asyncHandler(async (req, res) => {
    const consult = await Consultation.findOne({ _id: req.params.id, ...doctorFilter(req) });
    if (!consult) throw new AppError("Consultation not found.", 404, "NOT_FOUND");
    Object.assign(consult, {
      chiefComplaint: req.body.chiefComplaint ?? consult.chiefComplaint,
      history: req.body.history ?? consult.history,
      examination: req.body.examination ?? consult.examination,
      assessment: req.body.assessment ?? consult.assessment,
      plan: req.body.plan ?? consult.plan,
      vitals: req.body.vitals ?? consult.vitals,
    });
    if (req.body.status === "COMPLETED") {
      consult.status = "COMPLETED";
      consult.completedAt = new Date();
      const linked = await Appointment.findById(consult.appointmentId);
      if (linked) await markAppointmentCompleted(req, linked);
      if (req.body.followUpAt) {
        await FollowUp.create({
          patientId: consult.patientId,
          facilityId: consult.facilityId,
          doctorUserId: consult.doctorUserId,
          dueAt: req.body.followUpAt,
          reason: req.body.followUpReason || "Clinical follow-up",
          consultationId: consult._id,
        });
      }
    }
    await consult.save();
    await MedicalRecord.create({
      patientId: consult.patientId,
      facilityId: consult.facilityId,
      authorUserId: req.user._id,
      kind: "NOTE",
      title: "Consultation note",
      body: [consult.assessment, consult.plan].filter(Boolean).join("\n"),
      consultationId: consult._id,
    });
    res.json({ consultation: consult });
  }),

  createPrescription: asyncHandler(async (req, res) => {
    await assertPatientAccess(req, req.body.patientId);
    const medicines = medicinesFromBody(req.body);
    const adviceItems = adviceFromBody(req.body);
    const ctx = await loadLetterheadContext(req.facilityId, req.user._id);
    const snaps = snapshotLetterhead(ctx);
    const patient = await Patient.findById(req.body.patientId);
    if (!patient) throw new AppError("Patient not found.", 404, "NOT_FOUND");
    const rx = await Prescription.create({
      facilityId: req.facilityId,
      doctorUserId: req.user._id,
      patientId: req.body.patientId,
      consultationId: req.body.consultationId,
      status: PRESCRIPTION_STATUS.DRAFT,
      ...snaps,
      patientSnapshot: { ...defaultPatientSnapshot(patient), ...req.body.patientSnapshot },
      vitals: req.body.vitals || {},
      chiefComplaint: req.body.chiefComplaint,
      diagnosis: req.body.diagnosis,
      clinicalNotes: req.body.clinicalNotes,
      medicines,
      items: itemsFromMedicines(medicines),
      investigations: req.body.investigations || [],
      adviceItems,
      advice: adviceItems.join("\n"),
      followUpDate: req.body.followUpDate,
      substitutionAllowed: req.body.substitutionAllowed,
    });
    await writeAudit(req, { action: "PRESCRIPTION_CREATE", resource: "Prescription", resourceId: rx._id, facilityId: req.facilityId });
    const full = await populateRx(rx._id);
    res.status(201).json({ prescription: full, document: documentFromPrescription(full) });
  }),

  prescriptions: asyncHandler(async (req, res) => {
    const items = await Prescription.find(doctorFilter(req))
      .populate("patientId", "name mrn age sex")
      .populate("doctorUserId", "name")
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ prescriptions: items });
  }),

  prescriptionLetterhead: asyncHandler(async (req, res) => {
    const ctx = await loadLetterheadContext(req.facilityId, req.user._id);
    res.json(snapshotLetterhead(ctx));
  }),

  prescriptionOne: asyncHandler(async (req, res) => {
    const rx = await populateRx(req.params.id);
    assertCanViewPrescription(req, rx);
    await hydrateDocument(rx);
    res.json({ prescription: rx, document: documentFromPrescription(rx) });
  }),

  updatePrescription: asyncHandler(async (req, res) => {
    const rx = await Prescription.findById(req.params.id);
    assertCanWritePrescription(req, rx);
    if (rx.status !== PRESCRIPTION_STATUS.DRAFT) {
      throw new AppError("Finalized prescriptions cannot be edited. Create a revision instead.", 409, "RX_LOCKED");
    }
    const ctx = await loadLetterheadContext(rx.facilityId, rx.doctorUserId);
    applyClinicalBody(rx, req.body, { refreshLetterhead: snapshotLetterhead(ctx) });
    await rx.save();
    await writeAudit(req, { action: "PRESCRIPTION_UPDATE", resource: "Prescription", resourceId: rx._id, facilityId: req.facilityId });
    const full = await populateRx(rx._id);
    res.json({ prescription: full, document: documentFromPrescription(full) });
  }),

  finalizePrescription: asyncHandler(async (req, res) => {
    if (req.user.role !== ROLES.DOCTOR) {
      throw new AppError("Only the issuing doctor can finalize a prescription.", 403, "FORBIDDEN");
    }
    const rx = await Prescription.findById(req.params.id);
    assertCanWritePrescription(req, rx);
    if (rx.status !== PRESCRIPTION_STATUS.DRAFT) {
      throw new AppError("This prescription is already finalized.", 409, "RX_LOCKED");
    }
    const ctx = await loadLetterheadContext(rx.facilityId, rx.doctorUserId);
    applyClinicalBody(rx, req.body || {}, { refreshLetterhead: snapshotLetterhead(ctx) });
    rx.status = rx.revisionOf ? PRESCRIPTION_STATUS.REVISED : PRESCRIPTION_STATUS.FINALIZED;
    rx.finalizedAt = new Date();
    rx.issuedAt = new Date();
    await rx.save();
    await writeAudit(req, { action: "PRESCRIPTION_FINALIZE", resource: "Prescription", resourceId: rx._id, facilityId: req.facilityId });
    const full = await populateRx(rx._id);
    res.json({ prescription: full, document: documentFromPrescription(full) });
  }),

  revisePrescription: asyncHandler(async (req, res) => {
    if (req.user.role !== ROLES.DOCTOR) {
      throw new AppError("Only the issuing doctor can create a clinical revision.", 403, "FORBIDDEN");
    }
    const source = await Prescription.findById(req.params.id);
    assertCanWritePrescription(req, source);
    if (source.status === PRESCRIPTION_STATUS.DRAFT) {
      throw new AppError("Revise a finalized prescription. Drafts can be edited directly.", 400, "RX_STILL_DRAFT");
    }
    const copy = source.toObject();
    delete copy._id;
    delete copy.createdAt;
    delete copy.updatedAt;
    delete copy.finalizedAt;
    delete copy.issuedAt;
    const rx = await Prescription.create({
      ...copy,
      status: PRESCRIPTION_STATUS.DRAFT,
      revisionOf: source._id,
      revisionNumber: (source.revisionNumber || 1) + 1,
    });
    await writeAudit(req, {
      action: "PRESCRIPTION_REVISE",
      resource: "Prescription",
      resourceId: rx._id,
      facilityId: req.facilityId,
      metadata: { from: String(source._id) },
    });
    const full = await populateRx(rx._id);
    res.status(201).json({ prescription: full, document: documentFromPrescription(full) });
  }),

  prescriptionPdf: asyncHandler(async (req, res) => {
    const rx = await populateRx(req.params.id);
    assertCanViewPrescription(req, rx);
    await hydrateDocument(rx);
    const buf = await renderPrescriptionPdf(rx);
    await writeAudit(req, { action: "PRESCRIPTION_DOWNLOAD", resource: "Prescription", resourceId: rx._id, facilityId: req.facilityId });
    const name = `prescription-${rx.patientSnapshot?.mrn || rx._id}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.send(buf);
  }),

  referrals: asyncHandler(async (req, res) => {
    const q =
      req.user.role === ROLES.MAIN_ADMIN
        ? {}
        : {
            $or: [{ fromFacilityId: req.facilityId }, { toFacilityId: req.facilityId }],
          };
    if (req.user.role === ROLES.DOCTOR) {
      q.$or = [{ fromDoctorUserId: req.user._id }, { toDoctorUserId: req.user._id }];
      q.$and = [{ $or: [{ fromFacilityId: req.facilityId }, { toFacilityId: req.facilityId }] }];
    }
    const items = await Referral.find(q)
      .populate("patientId", "name mrn age sex")
      .populate("fromFacilityId", "name type city")
      .populate("toFacilityId", "name type city")
      .populate("fromDoctorUserId", "name")
      .sort({ createdAt: -1 });
    res.json({ referrals: items });
  }),

  createReferral: asyncHandler(async (req, res) => {
    if (String(req.body.toFacilityId) === String(req.facilityId) && req.user.role === ROLES.DOCTOR) {
      /* same-network referral still allowed */
    }
    const referral = await Referral.create({
      patientId: req.body.patientId,
      fromFacilityId: req.facilityId,
      fromDoctorUserId: req.user._id,
      toFacilityId: req.body.toFacilityId,
      toDoctorUserId: req.body.toDoctorUserId,
      reason: req.body.reason,
      specialty: req.body.specialty,
      priority: req.body.priority || "ROUTINE",
      status: REFERRAL_STATUS.CREATED,
      timeline: [{ status: REFERRAL_STATUS.CREATED, actorId: req.user._id, note: "Referral created" }],
    });
    const dest = await Facility.findById(req.body.toFacilityId);
    const admin = dest ? await User.findOne({ facilityId: dest._id, role: ROLES.FACILITY_ADMIN }) : null;
    const patient = await Patient.findById(req.body.patientId);
    if (admin) {
      await notifyUser(admin, {
        title: "Referral received",
        body: `A referral for ${patient?.name || "a patient"} was created.`,
        kind: "REFERRAL",
        channel: "referrals",
      });
      const emailOk = dest.notificationPrefs?.email !== false && dest.notificationPrefs?.referrals !== false;
      if (emailOk) await ifEmailAllowed(admin, () => sendReferralNotice(admin.email, patient?.name, "referring facility"));
    }
    await writeAudit(req, { action: "REFERRAL_CREATE", resource: "Referral", resourceId: referral._id, facilityId: req.facilityId });
    res.status(201).json({ referral });
  }),

  updateReferral: asyncHandler(async (req, res) => {
    const referral = await Referral.findById(req.params.id);
    if (!referral) throw new AppError("Referral not found.", 404, "NOT_FOUND");
    const involved = [String(referral.fromFacilityId), String(referral.toFacilityId)].includes(String(req.facilityId));
    if (req.user.role !== ROLES.MAIN_ADMIN && !involved && String(referral.fromDoctorUserId) !== String(req.user._id)) {
      throw new AppError("You cannot update this referral.", 403, "FORBIDDEN");
    }
    referral.status = req.body.status;
    referral.timeline.push({ status: req.body.status, actorId: req.user._id, note: req.body.note });
    if (req.body.appointmentId) referral.appointmentId = req.body.appointmentId;
    await referral.save();
    res.json({ referral });
  }),

  followUps: asyncHandler(async (req, res) => {
    const items = await FollowUp.find(doctorFilter(req))
      .populate("patientId", "name mrn")
      .sort({ dueAt: 1 });
    res.json({ followUps: items });
  }),

  updateFollowUp: asyncHandler(async (req, res) => {
    const item = await FollowUp.findOne({ _id: req.params.id, ...doctorFilter(req) });
    if (!item) throw new AppError("Follow-up not found.", 404, "NOT_FOUND");
    item.status = req.body.status;
    await item.save();
    res.json({ followUp: item });
  }),
};
