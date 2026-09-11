import { todayKey } from "./time.js";
import { DOCTOR_AVAILABILITY } from "./constants.js";
import { AppError } from "./errors.js";

export function publicUser(user) {
  if (!user) return null;
  const doc = user.toObject ? user.toObject() : { ...user };
  delete doc.passwordHash;
  delete doc.refreshTokenHash;
  delete doc.failedLogins;
  delete doc.lockUntil;
  delete doc.passwordResetHash;
  delete doc.passwordResetExpires;
  delete doc.pendingEmail;
  return doc;
}

export function assertDisplayName(value, label = "Name") {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new AppError(`${label} cannot be empty.`, 422, "NAME_INVALID");
  if (name.length > 120) throw new AppError(`${label} must be 120 characters or fewer.`, 422, "NAME_TOO_LONG");
  return name;
}

export function normalizePhone(phone) {
  if (phone == null) return "";
  return String(phone).replace(/[^\d+]/g, "");
}

export function assertValidPhone(phone) {
  const n = normalizePhone(phone);
  if (!n) return "";
  if (n.length < 10 || n.length > 15) {
    throw new AppError("Enter a valid phone number (10–15 digits).", 422, "PHONE_INVALID");
  }
  return n;
}

export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function minutesToTime(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function resolveTodayActive(facilityDoctor, profile) {
  const today = todayKey();
  if (facilityDoctor?.todayActiveOn === today && typeof facilityDoctor.todayActive === "boolean") {
    return facilityDoctor.todayActive;
  }
  const a = profile?.availability;
  return a === DOCTOR_AVAILABILITY.AVAILABLE || a === DOCTOR_AVAILABILITY.BUSY;
}

export function validateScheduleBlocks(blocks) {
  const list = blocks || [];
  const seen = new Set();
  for (const b of list) {
    if (!b.start || !b.end) {
      throw new AppError("Each slot needs a start and end time.", 422, "SCHEDULE_INVALID");
    }
    if (timeToMinutes(b.start) >= timeToMinutes(b.end)) {
      throw new AppError("Schedule end time must be after start time.", 422, "SCHEDULE_INVALID");
    }
    if (b.breakStart && b.breakEnd && timeToMinutes(b.breakStart) >= timeToMinutes(b.breakEnd)) {
      throw new AppError("Break end must be after break start.", 422, "SCHEDULE_INVALID");
    }
    const hasDays = Array.isArray(b.days) && b.days.length;
    if (!b.date && !hasDays) {
      throw new AppError("Each slot needs a weekday or a specific date.", 422, "SCHEDULE_INVALID");
    }
    const dayKey = b.date || [...(b.days || [])].sort().join(",");
    const ident = `${dayKey}|${b.start}|${b.end}`;
    if (seen.has(ident)) {
      throw new AppError("Duplicate identical slots are not allowed.", 422, "SCHEDULE_DUPLICATE");
    }
    seen.add(ident);
  }
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const A = list[i];
      const B = list[j];
      if (A.date || B.date) {
        if (!(A.date && B.date && A.date === B.date)) continue;
      } else {
        const dayOverlap = A.days?.some((d) => B.days?.includes(d));
        if (!dayOverlap) continue;
      }
      if (timeToMinutes(A.start) < timeToMinutes(B.end) && timeToMinutes(B.start) < timeToMinutes(A.end)) {
        throw new AppError("Working blocks overlap on the same day. Adjust the schedule to avoid conflicts.", 422, "SCHEDULE_CONFLICT");
      }
    }
  }
}
