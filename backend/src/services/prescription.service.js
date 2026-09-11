import PDFDocument from "pdfkit";
import {
  DoctorProfile,
  Facility,
  FacilityDoctor,
  Prescription,
  User,
} from "../models/index.js";
import { ROLES } from "../utils/constants.js";
import { AppError } from "../utils/errors.js";

function fmtDate(d) {
  if (!d) return "";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  return x.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function medicinesFromBody(body = {}) {
  if (Array.isArray(body.medicines) && body.medicines.length) {
    return body.medicines.map((m) => ({
      name: m.name || m.medicine || "",
      strength: m.strength || m.dose || "",
      dosage: m.dosage || "",
      frequency: m.frequency || "",
      duration: m.duration || "",
      instructions: m.instructions || "",
    }));
  }
  if (Array.isArray(body.items)) {
    return body.items.map((i) => ({
      name: i.medicine || i.name || "",
      strength: i.strength || i.dose || "",
      dosage: i.dosage || "",
      frequency: i.frequency || "",
      duration: i.duration || "",
      instructions: i.instructions || "",
    }));
  }
  return [];
}

export function itemsFromMedicines(medicines) {
  return (medicines || []).map((m) => ({
    medicine: m.name,
    dose: m.strength,
    frequency: m.frequency || m.dosage,
    duration: m.duration,
    instructions: m.instructions,
  }));
}

export function adviceFromBody(body = {}) {
  if (Array.isArray(body.adviceItems)) return body.adviceItems.map((s) => String(s).trim()).filter(Boolean);
  if (body.advice) return String(body.advice).split(/\n+/).map((s) => s.trim()).filter(Boolean);
  return [];
}

export async function loadLetterheadContext(facilityId, doctorUserId) {
  const [facility, doctorUser, doctorProfile, link] = await Promise.all([
    Facility.findById(facilityId),
    User.findById(doctorUserId).select("name email phone"),
    DoctorProfile.findOne({ userId: doctorUserId }),
    FacilityDoctor.findOne({ facilityId, userId: doctorUserId, status: "ACTIVE" }).populate("departmentId", "name"),
  ]);
  return { facility, doctorUser, doctorProfile, departmentName: link?.departmentId?.name || "" };
}

export function snapshotLetterhead({ facility, doctorUser, doctorProfile, departmentName }) {
  return {
    letterhead: {
      facilityName: facility?.name || "",
      department: departmentName || doctorProfile?.specialization || "",
      address: facility?.address || "",
      city: facility?.city || "",
      state: facility?.state || "",
      pin: facility?.pin || "",
      phone: facility?.contactNumber || "",
      email: facility?.officialEmail || "",
      website: facility?.website || "",
    },
    doctorSnapshot: {
      name: doctorUser?.name || "",
      qualification: doctorProfile?.qualification || "",
      registrationNumber: doctorProfile?.registrationNumber || "",
      specialization: doctorProfile?.specialization || "",
      signatureUrl: doctorProfile?.signatureUrl || "",
    },
  };
}

export function defaultPatientSnapshot(patient) {
  const parts = [patient?.city, patient?.district].filter(Boolean);
  return {
    name: patient?.name || "",
    mrn: patient?.mrn || "",
    age: patient?.age != null ? String(patient.age) : "",
    sex: patient?.sex || "",
    address: parts.join(", "),
    date: fmtDate(new Date()),
  };
}

export function applyClinicalBody(rx, body, { refreshLetterhead } = {}) {
  const medicines = medicinesFromBody(body);
  const adviceItems = body.adviceItems !== undefined || body.advice !== undefined ? adviceFromBody(body) : rx.adviceItems;
  if (body.patientSnapshot) rx.patientSnapshot = { ...rx.patientSnapshot, ...body.patientSnapshot };
  if (body.vitals) rx.vitals = { ...rx.vitals, ...body.vitals };
  if (body.chiefComplaint !== undefined) rx.chiefComplaint = body.chiefComplaint;
  if (body.diagnosis !== undefined) rx.diagnosis = body.diagnosis;
  if (body.clinicalNotes !== undefined) rx.clinicalNotes = body.clinicalNotes;
  if (body.medicines !== undefined || body.items !== undefined) {
    rx.medicines = medicines;
    rx.items = itemsFromMedicines(medicines);
  }
  if (body.investigations !== undefined) rx.investigations = body.investigations;
  if (body.adviceItems !== undefined || body.advice !== undefined) {
    rx.adviceItems = adviceItems;
    rx.advice = adviceItems.join("\n");
  }
  if (body.followUpDate !== undefined) rx.followUpDate = body.followUpDate || undefined;
  if (body.substitutionAllowed !== undefined) rx.substitutionAllowed = body.substitutionAllowed;
  if (body.consultationId !== undefined) rx.consultationId = body.consultationId;
  if (refreshLetterhead) {
    Object.assign(rx, refreshLetterhead);
  }
}

export function documentFromPrescription(rx) {
  const medicines = rx.medicines?.length
    ? rx.medicines
    : (rx.items || []).map((i) => ({
        name: i.medicine,
        strength: i.dose,
        dosage: "",
        frequency: i.frequency,
        duration: i.duration,
        instructions: i.instructions,
      }));
  const adviceItems = rx.adviceItems?.length ? rx.adviceItems : rx.advice ? [rx.advice] : [];
  return {
    letterhead: rx.letterhead || {},
    doctor: rx.doctorSnapshot || {},
    patient: rx.patientSnapshot || {},
    vitals: rx.vitals || {},
    chiefComplaint: rx.chiefComplaint || "",
    diagnosis: rx.diagnosis || "",
    clinicalNotes: rx.clinicalNotes || "",
    medicines,
    investigations: rx.investigations || [],
    adviceItems,
    followUpDate: rx.followUpDate,
    substitutionAllowed: rx.substitutionAllowed,
    status: rx.status,
    issuedAt: rx.issuedAt || rx.finalizedAt || rx.createdAt,
  };
}

export function assertCanWritePrescription(req, rx) {
  if (!rx) throw new AppError("Prescription not found.", 404, "NOT_FOUND");
  if (String(rx.facilityId) !== String(req.facilityId)) {
    throw new AppError("This prescription belongs to another facility.", 403, "FORBIDDEN");
  }
  if (req.user.role === ROLES.DOCTOR && String(rx.doctorUserId) !== String(req.user._id)) {
    throw new AppError("You can only change prescriptions you issued.", 403, "FORBIDDEN");
  }
  if (req.user.role === ROLES.FACILITY_ADMIN && String(req.user.facilityId) !== String(rx.facilityId)) {
    throw new AppError("You can only manage prescriptions for your facility.", 403, "FORBIDDEN");
  }
  if (req.user.role === ROLES.MAIN_ADMIN) {
    throw new AppError("Government administrators cannot edit clinical prescriptions.", 403, "MIN_NECESSARY");
  }
}

export function assertCanViewPrescription(req, rx) {
  if (!rx) throw new AppError("Prescription not found.", 404, "NOT_FOUND");
  if (req.user.role === ROLES.MAIN_ADMIN) {
    throw new AppError("Government administrators do not have routine access to prescriptions.", 403, "MIN_NECESSARY");
  }
  if (String(rx.facilityId) !== String(req.facilityId)) {
    throw new AppError("This prescription belongs to another facility.", 403, "FORBIDDEN");
  }
  if (req.user.role === ROLES.DOCTOR && String(rx.doctorUserId) !== String(req.user._id)) {
    throw new AppError("You can only view prescriptions you issued at this facility.", 403, "FORBIDDEN");
  }
}

export async function populateRx(id) {
  return Prescription.findById(id)
    .populate("patientId", "name mrn age sex city district phone")
    .populate("doctorUserId", "name email")
    .populate("facilityId", "name type city");
}

const NAVY = "#0b3d4a";
const TEAL = "#125564";
const INK = "#1c2b33";
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 40;
const HEADER_H = 118;
const FOOTER_H = 108;

function drawHeader(doc, d) {
  const lh = d.letterhead || {};
  const dr = d.doctor || {};
  let y = M;
  doc.fillColor(NAVY).font("Times-Bold").fontSize(16).text((lh.facilityName || "HEALTHCARE FACILITY").toUpperCase(), M, y, {
    width: PAGE_W - M * 2,
    align: "center",
  });
  y = doc.y + 2;
  if (lh.department) {
    doc.font("Times-Italic").fontSize(10).fillColor(TEAL).text(lh.department, M, y, { width: PAGE_W - M * 2, align: "center" });
    y = doc.y + 2;
  }
  const addr = [lh.address, [lh.city, lh.state, lh.pin].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  doc.font("Times-Roman").fontSize(8).fillColor(INK).text(addr, M, y, { width: PAGE_W - M * 2, align: "center" });
  y = doc.y + 1;
  const contact = [`Phone: ${lh.phone || "—"}`, lh.email ? `Email: ${lh.email}` : null, lh.website ? `Website: ${lh.website}` : null]
    .filter(Boolean)
    .join("   |   ");
  doc.text(contact, M, y, { width: PAGE_W - M * 2, align: "center" });
  y = doc.y + 8;
  doc.moveTo(M, y).lineTo(PAGE_W - M, y).strokeColor(NAVY).lineWidth(1.2).stroke();
  y += 8;
  doc.fillColor(NAVY).font("Times-Bold").fontSize(11).text((dr.name || "Doctor").toUpperCase(), M, y, {
    width: PAGE_W - M * 2,
    align: "center",
  });
  y = doc.y;
  const cred = [dr.qualification, dr.specialization ? `Specialization: ${dr.specialization}` : null, dr.registrationNumber ? `Reg. No. ${dr.registrationNumber}` : null]
    .filter(Boolean)
    .join("  ·  ");
  doc.font("Times-Roman").fontSize(8).fillColor(INK).text(cred, M, y, { width: PAGE_W - M * 2, align: "center" });
  y = doc.y + 6;
  doc.moveTo(M, y).lineTo(PAGE_W - M, y).strokeColor(NAVY).lineWidth(0.6).stroke();
}

function drawFooter(doc, d, page, pages) {
  const top = PAGE_H - M - FOOTER_H + 8;
  doc.save();
  doc.moveTo(M, top).lineTo(PAGE_W - M, top).strokeColor(NAVY).lineWidth(1).stroke();
  let y = top + 10;
  const yes = d.substitutionAllowed === true;
  const no = d.substitutionAllowed === false;
  doc.font("Times-Bold").fontSize(8).fillColor(NAVY).text("SUBSTITUTION PERMITTED:", M, y);
  doc.font("Times-Roman").fontSize(8).fillColor(INK);
  doc.rect(M + 132, y - 1, 9, 9).strokeColor(INK).lineWidth(0.6).stroke();
  if (yes) doc.font("Times-Bold").text("X", M + 133.5, y, { width: 8 });
  doc.font("Times-Roman").text("YES", M + 146, y);
  doc.rect(M + 178, y - 1, 9, 9).stroke();
  if (no) doc.font("Times-Bold").text("X", M + 179.5, y, { width: 8 });
  doc.font("Times-Roman").text("NO", M + 192, y);

  const fu = fmtDate(d.followUpDate);
  doc.font("Times-Bold").fillColor(NAVY).text("FOLLOW-UP DATE:", M + 240, y);
  doc.font("Times-Roman").fillColor(INK).text(fu || "____ / ____ / ______", M + 340, y);

  y += 28;
  const sigX = PAGE_W - M - 180;
  if (d.doctor?.signatureUrl) {
    doc.font("Times-Italic").fontSize(8).fillColor(TEAL).text("Signature on file with the facility", sigX, y, { width: 180, align: "center" });
  } else {
    doc.moveTo(sigX + 10, y + 18).lineTo(sigX + 170, y + 18).strokeColor(INK).lineWidth(0.5).stroke();
  }
  doc.font("Times-Bold").fontSize(7).fillColor(NAVY).text("DOCTOR'S SIGNATURE & STAMP", sigX, y + 22, { width: 180, align: "center" });

  y = PAGE_H - M - 22;
  doc.font("Times-Italic").fontSize(8).fillColor(INK).text("* Valid for 30 days from the date of issue *", M, y, {
    width: PAGE_W - M * 2,
    align: "center",
  });
  doc.font("Times-Roman").fontSize(7).fillColor("#667").text(`Page ${page} of ${pages}`, M, y + 12, {
    width: PAGE_W - M * 2,
    align: "center",
  });
  doc.restore();
}

function contentBottom() {
  return PAGE_H - M - FOOTER_H;
}

function sectionTitle(doc, title, y) {
  doc.font("Times-Bold").fontSize(8).fillColor(NAVY).text(title, M, y);
  const ty = doc.y + 2;
  doc.moveTo(M, ty).lineTo(PAGE_W - M, ty).strokeColor("#c5d0d3").lineWidth(0.4).stroke();
  return ty + 6;
}

export async function renderPrescriptionPdf(rx) {
  const d = documentFromPrescription(rx);
  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true, info: { Title: "Prescription", Author: d.letterhead.facilityName || "Healthcare facility" } });
  const chunks = [];
  const done = new Promise((resolve, reject) => {
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const innerW = PAGE_W - M * 2;
  let y = M + HEADER_H + 8;

  function ensureSpace(h) {
    if (y + h > contentBottom()) {
      doc.addPage();
      y = M + HEADER_H + 8;
    }
  }

  const p = d.patient || {};
  const v = d.vitals || {};
  ensureSpace(70);
  y = sectionTitle(doc, "PATIENT DETAILS", y);
  doc.font("Times-Roman").fontSize(9).fillColor(INK);
  const row1 = `Name: ${p.name || "—"}      Patient ID: ${p.mrn || "—"}      Age: ${p.age || "—"}      Sex: ${p.sex || "—"}      Date: ${p.date || fmtDate(d.issuedAt)}`;
  doc.text(row1, M, y, { width: innerW });
  y = doc.y + 2;
  doc.text(`Address: ${p.address || "—"}`, M, y, { width: innerW });
  y = doc.y + 2;
  doc.text(`Vitals:  BP ${v.bp || "—"}    Temp ${v.temperature || "—"}    Pulse ${v.pulse || "—"}    Weight ${v.weight || "—"}`, M, y, { width: innerW });
  y = doc.y + 10;

  ensureSpace(50);
  y = sectionTitle(doc, "DIAGNOSIS / CLINICAL NOTES", y);
  doc.font("Times-Roman").fontSize(9).fillColor(INK);
  if (d.chiefComplaint) {
    doc.font("Times-Bold").fontSize(8).text("Primary complaint / symptoms: ", M, y, { continued: true });
    doc.font("Times-Roman").text(d.chiefComplaint, { width: innerW });
    y = doc.y + 3;
  }
  if (d.diagnosis) {
    doc.font("Times-Bold").fontSize(8).text("Diagnosis: ", M, y, { continued: true });
    doc.font("Times-Roman").text(d.diagnosis, { width: innerW });
    y = doc.y + 3;
  }
  if (d.clinicalNotes) {
    doc.font("Times-Bold").fontSize(8).text("Clinical notes: ", M, y, { continued: true });
    doc.font("Times-Roman").text(d.clinicalNotes, { width: innerW });
    y = doc.y + 3;
  }
  y += 8;

  const meds = d.medicines.filter((m) => m.name);
  y = sectionTitle(doc, "Rx  MEDICINES", y);
  if (!meds.length) {
    doc.font("Times-Italic").fontSize(9).text("No medicines recorded.", M, y);
    y = doc.y + 8;
  }
  meds.forEach((m, i) => {
    const doseLine = [m.dosage && `Dosage: ${m.dosage}`, m.frequency && `Schedule: ${m.frequency}`, m.duration && `Duration: ${m.duration}`]
      .filter(Boolean)
      .join("    ");
    const block = `${i + 1}. ${m.name}${m.strength ? `  ${m.strength}` : ""}\n${doseLine}${m.instructions ? `\n${m.instructions}` : ""}`;
    const h = doc.heightOfString(block, { width: innerW - 8, font: "Times-Roman", fontSize: 9 }) + 10;
    ensureSpace(h);
    doc.font("Times-Bold").fontSize(10).fillColor(INK).text(`${i + 1}. ${m.name}${m.strength ? `  ${m.strength}` : ""}`, M, y, { width: innerW });
    y = doc.y + 1;
    if (doseLine) {
      doc.font("Times-Roman").fontSize(8).text(doseLine, M + 16, y, { width: innerW - 16 });
      y = doc.y;
    }
    if (m.instructions) {
      doc.font("Times-Italic").fontSize(8).fillColor("#334").text(m.instructions, M + 16, y, { width: innerW - 16 });
      y = doc.y;
    }
    y += 8;
  });

  const tests = (d.investigations || []).filter((t) => t.name);
  if (tests.length) {
    ensureSpace(28);
    y = sectionTitle(doc, "INVESTIGATIONS / TESTS ADVISED", y);
    tests.forEach((t) => {
      ensureSpace(14);
      doc.rect(M, y + 1, 8, 8).strokeColor(INK).lineWidth(0.5).stroke();
      if (t.advised !== false) doc.font("Times-Bold").fontSize(8).text("X", M + 1.2, y, { width: 8 });
      doc.font("Times-Roman").fontSize(9).fillColor(INK).text(t.name, M + 14, y, { width: innerW - 14 });
      y = Math.max(doc.y, y + 12);
    });
    y += 6;
  }

  const advice = d.adviceItems || [];
  if (advice.length) {
    ensureSpace(28);
    y = sectionTitle(doc, "GENERAL ADVICE / LIFESTYLE INSTRUCTIONS", y);
    advice.forEach((a) => {
      const h = doc.heightOfString(`• ${a}`, { width: innerW, fontSize: 9 }) + 4;
      ensureSpace(h);
      doc.font("Times-Roman").fontSize(9).fillColor(INK).text(`• ${a}`, M, y, { width: innerW });
      y = doc.y + 2;
    });
  }

  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(i);
    drawHeader(doc, d);
    drawFooter(doc, d, i + 1, pages.count);
  }
  doc.end();
  return done;
}
