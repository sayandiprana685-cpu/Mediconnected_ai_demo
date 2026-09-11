import { FamilyMember, HealthMetric, MedicineReminder } from "../models/index.js";
import { HEALTH_METRIC_KINDS } from "../models/HealthMetric.js";
import { AppError } from "../utils/errors.js";
import { assertObjectId } from "../utils/objectId.js";

// Units are fixed per kind so a chart never mixes mmHg with kg on one axis.
const KIND_UNITS = {
  BLOOD_PRESSURE: "mmHg",
  BLOOD_SUGAR: "mg/dL",
  WEIGHT: "kg",
  STEPS: "steps",
  HEART_RATE: "bpm",
  SPO2: "%",
  TEMPERATURE: "°C",
  OTHER: "",
};

const RANGES = {
  TODAY: { key: "TODAY", label: "Today", ms: 24 * 60 * 60 * 1000 },
  "7D": { key: "7D", label: "7 Days", ms: 7 * 24 * 60 * 60 * 1000 },
  "30D": { key: "30D", label: "30 Days", ms: 30 * 24 * 60 * 60 * 1000 },
  "6M": { key: "6M", label: "6 Months", ms: 182 * 24 * 60 * 60 * 1000 },
};

function rangeOf(key) {
  const k = String(key || "30D").toUpperCase();
  return RANGES[k] || RANGES["30D"];
}

function serializeMetric(m) {
  const o = m.toObject ? m.toObject() : m;
  return {
    id: String(o._id),
    kind: o.kind,
    value: o.value,
    valueSecondary: o.valueSecondary ?? null,
    unit: o.unit || KIND_UNITS[o.kind] || "",
    measuredAt: o.measuredAt,
    source: o.source || "MANUAL",
    note: o.note || "",
    familyMemberId: o.familyMemberId ? String(o.familyMemberId) : null,
    createdAt: o.createdAt,
  };
}

/**
 * POST /api/mobile/metrics — record one reading.
 * Rejects physiologically impossible numbers at the door: a typo of 900 for a
 * systolic pressure would otherwise poison every trend chart that follows it.
 */
export async function addMetric({ user, patient, body }) {
  const kind = String(body.kind || "").toUpperCase();
  if (!HEALTH_METRIC_KINDS.includes(kind)) {
    throw new AppError("Choose a valid measurement type.", 422, "KIND_INVALID");
  }
  const value = Number(body.value);
  if (!Number.isFinite(value)) throw new AppError("Enter a number.", 422, "VALUE_INVALID");

  const LIMITS = {
    BLOOD_PRESSURE: [40, 300],
    BLOOD_SUGAR: [20, 900],
    WEIGHT: [1, 400],
    STEPS: [0, 200000],
    HEART_RATE: [20, 300],
    SPO2: [30, 100],
    TEMPERATURE: [25, 45],
    OTHER: [-1e6, 1e6],
  };
  const [lo, hi] = LIMITS[kind];
  if (value < lo || value > hi) {
    throw new AppError(`${kind.replace(/_/g, " ").toLowerCase()} must be between ${lo} and ${hi}.`, 422, "VALUE_OUT_OF_RANGE");
  }

  let secondary;
  if (kind === "BLOOD_PRESSURE") {
    secondary = Number(body.valueSecondary);
    if (!Number.isFinite(secondary) || secondary < 20 || secondary > 200) {
      throw new AppError("Enter a diastolic pressure between 20 and 200.", 422, "VALUE_OUT_OF_RANGE");
    }
    if (secondary >= value) {
      throw new AppError("The lower (diastolic) number must be less than the upper (systolic) number.", 422, "BP_INCONSISTENT");
    }
  }

  const measuredAt = body.measuredAt ? new Date(body.measuredAt) : new Date();
  if (Number.isNaN(measuredAt.getTime())) throw new AppError("That date is not valid.", 422, "DATE_INVALID");
  if (measuredAt.getTime() > Date.now() + 60 * 1000) {
    throw new AppError("A reading cannot be in the future.", 422, "DATE_IN_FUTURE");
  }

  if (body.familyMemberId) {
    const fm = await FamilyMember.findOne({ _id: assertObjectId(body.familyMemberId, "familyMemberId", "FAMILY_MEMBER_INVALID"), userId: user._id });
    if (!fm) throw new AppError("That family member was not found.", 404, "FAMILY_MEMBER_NOT_FOUND");
  }

  const metric = await HealthMetric.create({
    patientId: patient._id,
    userId: user._id,
    familyMemberId: body.familyMemberId || undefined,
    kind,
    value,
    valueSecondary: secondary,
    unit: body.unit ? String(body.unit).slice(0, 20) : KIND_UNITS[kind],
    measuredAt,
    source: ["MANUAL", "DEVICE", "LAB"].includes(body.source) ? body.source : "MANUAL",
    note: String(body.note || "").slice(0, 300) || undefined,
  });
  return serializeMetric(metric);
}

/**
 * GET /api/mobile/metrics?range=7D&kind=WEIGHT
 * Returns the readings plus the numbers a trend chart needs, so the app draws
 * a line without doing date maths on the phone.
 */
export async function listMetrics(patientId, { range, kind, familyMemberId, limit } = {}) {
  const r = rangeOf(range);
  const since = new Date(Date.now() - r.ms);
  const filter = { patientId, measuredAt: { $gte: since } };
  if (kind) {
    const k = String(kind).toUpperCase();
    if (!HEALTH_METRIC_KINDS.includes(k)) throw new AppError("Unknown measurement type.", 422, "KIND_INVALID");
    filter.kind = k;
  }
  if (familyMemberId) filter.familyMemberId = assertObjectId(familyMemberId, "familyMemberId", "FAMILY_MEMBER_INVALID");
  else filter.familyMemberId = null;

  const cap = Math.min(Number(limit) || 500, 2000);
  const rows = await HealthMetric.find(filter).sort({ measuredAt: -1 }).limit(cap);
  const metrics = rows.map(serializeMetric).reverse();

  const byKind = {};
  for (const m of metrics) {
    const list = (byKind[m.kind] ||= []);
    list.push(m);
  }
  const series = Object.entries(byKind).map(([k, list]) => {
    const nums = list.map((m) => m.value);
    return {
      kind: k,
      unit: list[0].unit,
      count: list.length,
      latest: list[list.length - 1] || null,
      min: nums.length ? Math.min(...nums) : null,
      max: nums.length ? Math.max(...nums) : null,
      average: nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null,
      points: list.map((m) => ({ at: m.measuredAt, value: m.value, secondary: m.valueSecondary })),
    };
  });

  return { range: r.key, rangeLabel: r.label, since, metrics, series };
}

/** DELETE /api/mobile/metrics/:id */
export async function deleteMetric(userId, id) {
  const row = await HealthMetric.findOneAndDelete({ _id: assertObjectId(id, "metricId", "METRIC_INVALID"), userId });
  if (!row) throw new AppError("That reading was not found.", 404, "NOT_FOUND");
  return { ok: true, id: String(row._id) };
}

// ---------------------------------------------------------------------------
// Medicine reminders
// ---------------------------------------------------------------------------

const TIME_RX = /^([01]\d|2[0-3]):[0-5]\d$/;

function serializeReminder(r) {
  const o = r.toObject ? r.toObject() : r;
  return {
    id: String(o._id),
    medicineName: o.medicineName,
    dosage: o.dosage || "",
    instructions: o.instructions || "",
    times: o.times || [],
    days: o.days || [],
    startDate: o.startDate,
    endDate: o.endDate || null,
    prescriptionId: o.prescriptionId ? String(o.prescriptionId) : null,
    familyMemberId: o.familyMemberId ? String(o.familyMemberId) : null,
    active: o.active !== false,
    lastNotifiedAt: o.lastNotifiedAt || null,
    deviceNotificationId: o.deviceNotificationId || null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function normalizeTimes(times) {
  const list = Array.isArray(times) ? times : String(times || "").split(",");
  const clean = list.map((t) => String(t).trim()).filter(Boolean);
  if (!clean.length) throw new AppError("Add at least one time of day.", 422, "TIMES_REQUIRED");
  if (clean.length > 8) throw new AppError("A maximum of 8 times per day is allowed.", 422, "TIMES_TOO_MANY");
  for (const t of clean) {
    if (!TIME_RX.test(t)) throw new AppError(`"${t}" is not a valid time. Use HH:MM, for example 08:30.`, 422, "TIME_INVALID");
  }
  return [...new Set(clean)].sort();
}

function normalizeDays(days) {
  if (days == null || (Array.isArray(days) && !days.length)) return [];
  const list = Array.isArray(days) ? days : String(days).split(",");
  const nums = list.map((d) => Number(String(d).trim())).filter((d) => Number.isInteger(d));
  for (const d of nums) {
    if (d < 0 || d > 6) throw new AppError("Days must be 0 (Sunday) to 6 (Saturday).", 422, "DAY_INVALID");
  }
  return [...new Set(nums)].sort();
}

/** POST /api/mobile/reminders */
export async function createReminder({ user, patient, body }) {
  const name = String(body.medicineName || "").trim();
  if (name.length < 2) throw new AppError("Enter the medicine name.", 422, "NAME_INVALID");

  if (body.familyMemberId) {
    const fm = await FamilyMember.findOne({ _id: assertObjectId(body.familyMemberId, "familyMemberId", "FAMILY_MEMBER_INVALID"), userId: user._id });
    if (!fm) throw new AppError("That family member was not found.", 404, "FAMILY_MEMBER_NOT_FOUND");
  }
  const start = body.startDate ? new Date(body.startDate) : new Date();
  if (Number.isNaN(start.getTime())) throw new AppError("That start date is not valid.", 422, "DATE_INVALID");
  let end = null;
  if (body.endDate) {
    end = new Date(body.endDate);
    if (Number.isNaN(end.getTime())) throw new AppError("That end date is not valid.", 422, "DATE_INVALID");
    if (end <= start) throw new AppError("The end date must be after the start date.", 422, "DATE_RANGE_INVALID");
  }

  const reminder = await MedicineReminder.create({
    userId: user._id,
    patientId: patient._id,
    familyMemberId: body.familyMemberId || undefined,
    medicineName: name.slice(0, 160),
    dosage: String(body.dosage || "").slice(0, 80) || undefined,
    instructions: String(body.instructions || "").slice(0, 200) || undefined,
    times: normalizeTimes(body.times),
    days: normalizeDays(body.days),
    startDate: start,
    endDate: end || undefined,
    prescriptionId: body.prescriptionId || undefined,
    active: body.active !== false,
  });
  return serializeReminder(reminder);
}

/** GET /api/mobile/reminders */
export async function listReminders(userId, { includeInactive } = {}) {
  const filter = includeInactive ? { userId } : { userId, active: true };
  const rows = await MedicineReminder.find(filter).sort({ createdAt: -1 }).limit(100);
  return rows.map(serializeReminder);
}

/** PATCH /api/mobile/reminders/:id — edit, pause, resume or archive. */
export async function updateReminder(userId, id, body) {
  const row = await MedicineReminder.findOne({ _id: assertObjectId(id, "reminderId", "REMINDER_INVALID"), userId });
  if (!row) throw new AppError("That reminder was not found.", 404, "NOT_FOUND");

  if (body.medicineName != null) {
    const name = String(body.medicineName).trim();
    if (name.length < 2) throw new AppError("Enter the medicine name.", 422, "NAME_INVALID");
    row.medicineName = name.slice(0, 160);
  }
  if (body.dosage != null) row.dosage = String(body.dosage).slice(0, 80);
  if (body.instructions != null) row.instructions = String(body.instructions).slice(0, 200);
  if (body.times != null) row.times = normalizeTimes(body.times);
  if (body.days != null) row.days = normalizeDays(body.days);
  if (body.active != null) row.active = !!body.active;
  if (body.deviceNotificationId != null) {
    row.deviceNotificationId = String(body.deviceNotificationId).slice(0, 120);
  }
  if (body.endDate !== undefined) {
    row.endDate = body.endDate ? new Date(body.endDate) : null;
    if (body.endDate && Number.isNaN(row.endDate?.getTime())) {
      throw new AppError("That end date is not valid.", 422, "DATE_INVALID");
    }
  }
  await row.save();
  return serializeReminder(row);
}

/** DELETE /api/mobile/reminders/:id */
export async function deleteReminder(userId, id) {
  const row = await MedicineReminder.findOneAndDelete({ _id: assertObjectId(id, "reminderId", "REMINDER_INVALID"), userId });
  if (!row) throw new AppError("That reminder was not found.", 404, "NOT_FOUND");
  return { ok: true, id: String(row._id) };
}
