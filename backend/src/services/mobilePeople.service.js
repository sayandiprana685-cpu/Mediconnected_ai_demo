import mongoose from "mongoose";
import { Facility, FamilyMember, ProviderReview, User } from "../models/index.js";
import { FAMILY_RELATIONS } from "../models/FamilyMember.js";
import { FACILITY_STATUS } from "../utils/constants.js";
import { AppError } from "../utils/errors.js";
import { assertObjectId } from "../utils/objectId.js";

// ---------------------------------------------------------------------------
// Family members
// ---------------------------------------------------------------------------

const AVATAR_TONES = ["teal", "blue", "green", "amber", "violet", "rose"];

function serializeMember(m) {
  const o = m.toObject ? m.toObject() : m;
  return {
    id: String(o._id),
    name: o.name,
    relation: o.relation,
    sex: o.sex || "",
    dateOfBirth: o.dateOfBirth || null,
    age: o.age ?? null,
    bloodGroup: o.bloodGroup || "",
    allergies: o.allergies || [],
    conditions: o.conditions || [],
    phone: o.phone || "",
    address: o.address || "",
    linkedPatientId: o.linkedPatientId ? String(o.linkedPatientId) : null,
    isDefault: !!o.isDefault,
    avatarTone: o.avatarTone || "teal",
    initials: initialsOf(o.name),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function initialsOf(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();
}

function listOf(value, max = 12, maxLen = 80) {
  const arr = Array.isArray(value) ? value : String(value || "").split(",");
  return arr.map((s) => String(s).trim()).filter(Boolean).slice(0, max).map((s) => s.slice(0, maxLen));
}

function applyMemberFields(row, body) {
  if (body.name != null) {
    const name = String(body.name).trim().replace(/\s+/g, " ");
    if (name.length < 2) throw new AppError("Enter a name of at least 2 characters.", 422, "NAME_INVALID");
    row.name = name.slice(0, 120);
  }
  if (body.relation != null) {
    const rel = String(body.relation).toUpperCase();
    if (!FAMILY_RELATIONS.includes(rel)) throw new AppError("Choose a valid relationship.", 422, "RELATION_INVALID");
    row.relation = rel;
  }
  if (body.sex != null) {
    if (!["Female", "Male", "Other"].includes(body.sex)) throw new AppError("Choose Female, Male or Other.", 422, "SEX_INVALID");
    row.sex = body.sex;
  }
  if (body.dateOfBirth !== undefined) {
    row.dateOfBirth = body.dateOfBirth ? new Date(body.dateOfBirth) : null;
    if (body.dateOfBirth && Number.isNaN(row.dateOfBirth?.getTime())) {
      throw new AppError("That date of birth is not valid.", 422, "DOB_INVALID");
    }
    if (row.dateOfBirth && row.dateOfBirth.getTime() > Date.now()) {
      throw new AppError("Date of birth cannot be in the future.", 422, "DOB_FUTURE");
    }
    if (row.dateOfBirth) {
      row.age = Math.max(0, Math.floor((Date.now() - row.dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000)));
    }
  }
  if (body.age != null && body.dateOfBirth == null) {
    const age = Number(body.age);
    if (!Number.isFinite(age) || age < 0 || age > 130) throw new AppError("Enter an age between 0 and 130.", 422, "AGE_INVALID");
    row.age = Math.floor(age);
  }
  if (body.bloodGroup != null) row.bloodGroup = String(body.bloodGroup).trim().slice(0, 5);
  if (body.allergies != null) row.allergies = listOf(body.allergies);
  if (body.conditions != null) row.conditions = listOf(body.conditions);
  if (body.phone != null) row.phone = String(body.phone).replace(/[^\d+]/g, "").slice(0, 20);
  if (body.address != null) row.address = String(body.address).trim().slice(0, 300);
  if (body.avatarTone != null) {
    row.avatarTone = AVATAR_TONES.includes(String(body.avatarTone)) ? String(body.avatarTone) : "teal";
  }
  return row;
}

/** POST /api/mobile/family */
export async function createFamilyMember({ user, patient, body }) {
  const count = await FamilyMember.countDocuments({ userId: user._id });
  if (count >= 10) throw new AppError("You can add up to 10 family members.", 422, "TOO_MANY_MEMBERS");

  const row = applyMemberFields(new FamilyMember({ userId: user._id, ownerPatientId: patient?._id }), body);
  if (!row.name) throw new AppError("Enter a name.", 422, "NAME_INVALID");
  if (!row.avatarTone) row.avatarTone = AVATAR_TONES[count % AVATAR_TONES.length];

  // The very first member becomes the one pre-selected when booking, so the
  // patient is not asked "who is this for?" on every single order.
  row.isDefault = !!body.isDefault || count === 0;
  if (row.isDefault) await FamilyMember.updateMany({ userId: user._id }, { $set: { isDefault: false } });

  await row.save();
  return serializeMember(row);
}

/** GET /api/mobile/family */
export async function listFamilyMembers(userId) {
  const rows = await FamilyMember.find({ userId }).sort({ createdAt: 1 }).limit(20);
  return rows.map(serializeMember);
}

/** PATCH /api/mobile/family/:id */
export async function updateFamilyMember(userId, id, body) {
  const row = await FamilyMember.findOne({ _id: assertObjectId(id, "familyMemberId", "FAMILY_MEMBER_INVALID"), userId });
  if (!row) throw new AppError("That family member was not found.", 404, "NOT_FOUND");
  applyMemberFields(row, body);
  if (body.isDefault === true) {
    await FamilyMember.updateMany({ userId }, { $set: { isDefault: false } });
    row.isDefault = true;
  }
  await row.save();
  return serializeMember(row);
}

/** DELETE /api/mobile/family/:id */
export async function deleteFamilyMember(userId, id) {
  const row = await FamilyMember.findOneAndDelete({ _id: assertObjectId(id, "familyMemberId", "FAMILY_MEMBER_INVALID"), userId });
  if (!row) throw new AppError("That family member was not found.", 404, "NOT_FOUND");
  // Promote someone else so there is always a pre-selected member.
  if (row.isDefault) {
    const next = await FamilyMember.findOne({ userId }).sort({ createdAt: 1 });
    if (next) {
      next.isDefault = true;
      await next.save();
    }
  }
  return { ok: true, id: String(row._id) };
}

// ---------------------------------------------------------------------------
// Ratings and reviews
// ---------------------------------------------------------------------------

function serializeReview(r, authorName) {
  const o = r.toObject ? r.toObject() : r;
  return {
    id: String(o._id),
    facilityId: String(o.facilityId),
    doctorUserId: o.doctorUserId ? String(o.doctorUserId) : null,
    rating: o.rating,
    title: o.title || "",
    body: o.body || "",
    visitContext: o.visitContext || "OTHER",
    authorName: authorName || "A patient",
    // Set by the caller: only the route knows whether the reader owns this row.
    isMine: false,
    reply: o.reply?.body ? { body: o.reply.body, at: o.reply.at } : null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

/**
 * GET /api/mobile/reviews?facilityId=&doctorUserId=
 * Returns the summary and the reviews together: a provider page needs the
 * average and the count before it needs the list, and one round trip on a slow
 * rural connection beats two.
 */
export async function listReviews({ facilityId, doctorUserId, limit, currentUserId }) {
  if (!facilityId) throw new AppError("facilityId is required.", 422, "FACILITY_REQUIRED");
  if (!mongoose.isValidObjectId(facilityId)) throw new AppError("facilityId is not valid.", 422, "FACILITY_INVALID");
  const filter = { facilityId: new mongoose.Types.ObjectId(String(facilityId)), status: "VISIBLE" };
  if (doctorUserId) {
    if (!mongoose.isValidObjectId(doctorUserId)) throw new AppError("doctorUserId is not valid.", 422, "DOCTOR_INVALID");
    filter.doctorUserId = new mongoose.Types.ObjectId(String(doctorUserId));
  }

  const cap = Math.min(Number(limit) || 20, 100);
  const [rows, stats] = await Promise.all([
    ProviderReview.find(filter).sort({ createdAt: -1 }).limit(cap),
    // One pass for average, count AND the star breakdown, over every visible
    // review rather than just the page shown - a long tail of old reviews must
    // not silently change the rating because it fell off the first screen.
    ProviderReview.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$rating",
          n: { $sum: 1 },
        },
      },
    ]),
  ]);

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let sum = 0;
  for (const s of stats) {
    const star = Number(s._id);
    if (star >= 1 && star <= 5) distribution[star] = s.n;
    total += s.n;
    sum += star * s.n;
  }

  const authorIds = [...new Set(rows.map((r) => String(r.userId)))];
  const authors = await User.find({ _id: { $in: authorIds } }).select("name");
  const nameMap = Object.fromEntries(authors.map((a) => [String(a._id), a.name]));
  const me = currentUserId ? String(currentUserId) : null;

  return {
    summary: {
      facilityId: String(facilityId),
      doctorUserId: doctorUserId ? String(doctorUserId) : null,
      average: total ? Math.round((sum / total) * 10) / 10 : 0,
      count: total,
      distribution,
    },
    reviews: rows.map((r) => {
      const out = serializeReview(r, nameMap[String(r.userId)]);
      // Names are shown as first name plus initial: a review is public to other
      // patients, so a full name is more identifying than the opinion needs.
      out.authorName = publicAuthorName(nameMap[String(r.userId)]);
      out.isMine = me != null && String(r.userId) === me;
      return out;
    }),
  };
}

function publicAuthorName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "A patient";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/**
 * POST /api/mobile/reviews — write or update a review.
 * Upserts on (user, facility, doctor) because the unique index says one person
 * gets one opinion per provider: a second visit revises the first review rather
 * than letting a single user move a provider's average twice.
 */
export async function writeReview({ user, patient, body }) {
  if (!mongoose.isValidObjectId(body.facilityId)) {
    throw new AppError("facilityId is not valid.", 422, "FACILITY_INVALID");
  }
  const facility = await Facility.findOne({ _id: body.facilityId, status: FACILITY_STATUS.VERIFIED });
  if (!facility) throw new AppError("You can only review a verified provider.", 404, "FACILITY_NOT_FOUND");

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new AppError("Choose a rating from 1 to 5 stars.", 422, "RATING_INVALID");
  }
  const reviewText = String(body.body || "").trim();
  if (reviewText.length < 3) throw new AppError("Write a few words about your visit.", 422, "BODY_TOO_SHORT");

  let doctorUserId;
  if (body.doctorUserId) {
    if (!mongoose.isValidObjectId(body.doctorUserId)) {
      throw new AppError("doctorUserId is not valid.", 422, "DOCTOR_INVALID");
    }
    const doc = await User.findOne({ _id: body.doctorUserId, role: "DOCTOR" });
    if (!doc) throw new AppError("That doctor was not found.", 404, "DOCTOR_NOT_FOUND");
    doctorUserId = doc._id;
  }

  const contexts = ["CONSULTATION", "LAB", "PHARMACY", "HOSPITAL", "ORDER", "OTHER"];
  const existing = await ProviderReview.findOne({
    userId: user._id,
    facilityId: facility._id,
    doctorUserId: doctorUserId || null,
  });

  if (existing) {
    existing.rating = rating;
    existing.title = String(body.title || "").slice(0, 120);
    existing.body = reviewText.slice(0, 1000);
    existing.visitContext = contexts.includes(body.visitContext) ? body.visitContext : "OTHER";
    existing.status = "VISIBLE";
    await existing.save();
    return { review: { ...serializeReview(existing, user.name), isMine: true }, updated: true };
  }

  const created = await ProviderReview.create({
    facilityId: facility._id,
    doctorUserId: doctorUserId || undefined,
    userId: user._id,
    patientId: patient?._id,
    rating,
    title: String(body.title || "").slice(0, 120),
    body: reviewText.slice(0, 1000),
    visitContext: contexts.includes(body.visitContext) ? body.visitContext : "OTHER",
  });
  return { review: { ...serializeReview(created, user.name), isMine: true }, updated: false };
}

/** DELETE /api/mobile/reviews/:id — withdraw your own review. */
export async function deleteReview(userId, id) {
  const row = await ProviderReview.findOneAndDelete({ _id: assertObjectId(id, "reviewId", "REVIEW_INVALID"), userId });
  if (!row) throw new AppError("That review was not found.", 404, "NOT_FOUND");
  return { ok: true, id: String(row._id) };
}
