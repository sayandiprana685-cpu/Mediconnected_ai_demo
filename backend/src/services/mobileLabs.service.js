import { DiagnosticTest, Facility, LabOrder, Referral, User } from "../models/index.js";
import { FACILITY_STATUS, FACILITY_TYPES, LAB_ORDER_STATUS, LAB_ORDER_TRANSITIONS } from "../utils/constants.js";
import { publicFacility, rankProviders } from "../utils/geo.js";
import { AppError } from "../utils/errors.js";
import { assertObjectId } from "../utils/objectId.js";

const DIAGNOSTIC_TYPES = [FACILITY_TYPES.DIAGNOSTIC_CENTRE, FACILITY_TYPES.LABORATORY];

function escape(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Verified diagnostic facilities in the patient's area. Everything the patient
 * can book a test at comes from here, so a lab that registers on the website
 * and is verified shows up in this list with no app change.
 */
async function verifiedLabs(locCtx) {
  const filter = { status: FACILITY_STATUS.VERIFIED, type: { $in: DIAGNOSTIC_TYPES } };
  if (locCtx.district) filter.district = new RegExp(`^${escape(locCtx.district)}$`, "i");
  const docs = await Facility.find(filter).limit(200);
  return rankProviders(docs, locCtx);
}

function serializeTest(t, facility, locCtx) {
  return {
    id: String(t._id),
    name: t.name,
    code: t.code || "",
    category: t.category || "GENERAL",
    sampleType: t.sampleType || "",
    preparation: t.preparation || "",
    turnaroundMinutes: t.turnaroundMinutes ?? null,
    homeCollection: !!t.homeCollection,
    price: t.price ?? null,
    referenceRange: t.referenceRange || "",
    units: t.units || "",
    available: t.available !== false,
    updatedAt: t.updatedAt,
    facility: facility ? publicFacility(facility, locCtx) : null,
  };
}

/**
 * GET /api/mobile/lab-tests — the searchable test catalogue.
 * With `q`, results are grouped by test name so the app can show one row per
 * test with every lab that offers it; that grouping IS the compare-providers
 * screen, so no second endpoint is needed.
 */
export async function listLabTests({ query, patient }) {
  const locCtx = {
    district: query.district || patient?.district,
    city: query.city || patient?.city,
    lat: query.lat != null ? Number(query.lat) : patient?.geo?.lat,
    lng: query.lng != null ? Number(query.lng) : patient?.geo?.lng,
  };
  const labs = await verifiedLabs(locCtx);
  if (!labs.length) return { tests: [], groups: [], total: 0, loc: locCtx };

  const labIds = labs.map((f) => f._id);
  const filter = { facilityId: { $in: labIds }, status: "ACTIVE", available: { $ne: false } };
  const q = String(query.q || "").trim();
  if (q) {
    const rx = new RegExp(escape(q), "i");
    filter.$or = [{ name: rx }, { code: rx }, { category: rx }, { sampleType: rx }];
  }
  if (query.category) filter.category = new RegExp(`^${escape(query.category)}$`, "i");
  if (query.facilityId) filter.facilityId = assertObjectId(query.facilityId, "facilityId", "FACILITY_INVALID");

  const rows = await DiagnosticTest.find(filter).sort({ name: 1 }).limit(300);
  const facMap = Object.fromEntries(labs.map((f) => [String(f._id), f]));
  const tests = rows.map((t) => serializeTest(t, facMap[String(t.facilityId)], locCtx));

  // Cheapest offer first inside each group, so the top of a group is the best
  // deal and the spread underneath is what "compare providers" really means.
  const byName = new Map();
  for (const t of tests) {
    const key = t.name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(t);
  }
  const groups = [...byName.entries()]
    .map(([name, offers]) => {
      const priced = offers.filter((o) => o.price != null);
      const sorted = [...offers].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
      return {
        name,
        displayName: offers[0].name,
        category: offers[0].category,
        sampleType: offers[0].sampleType,
        offerCount: offers.length,
        lowestPrice: priced.length ? Math.min(...priced.map((o) => o.price)) : null,
        highestPrice: priced.length ? Math.max(...priced.map((o) => o.price)) : null,
        homeCollectionAvailable: offers.some((o) => o.homeCollection),
        offers: sorted,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return { tests, groups, total: tests.length, loc: locCtx };
}

/**
 * POST /api/mobile/lab-orders — the patient books a slot at a real lab.
 * Writes the SAME LabOrder document a lab technician would create, so the
 * lab's existing dashboard and status workflow pick it up unchanged and the
 * report lands in /api/mobile/reports once the lab finalises it.
 */
export async function bookLabOrder({ user, patient, body }) {
  if (!String(body.testId || "").trim()) throw new AppError("Choose a test to book.", 422, "TEST_REQUIRED");
  const testId = assertObjectId(body.testId, "testId", "TEST_INVALID");

  const test = await DiagnosticTest.findOne({ _id: testId, status: "ACTIVE" });
  if (!test) throw new AppError("That test is no longer offered.", 404, "TEST_NOT_FOUND");

  const facility = await Facility.findOne({ _id: test.facilityId, status: FACILITY_STATUS.VERIFIED });
  if (!facility || !DIAGNOSTIC_TYPES.includes(facility.type)) {
    throw new AppError("That laboratory is not available for booking.", 422, "LAB_NOT_AVAILABLE");
  }

  const when = body.scheduledAt ? new Date(body.scheduledAt) : null;
  if (body.scheduledAt && Number.isNaN(when.getTime())) {
    throw new AppError("That date and time is not valid.", 422, "INVALID_TIME");
  }
  if (when && when.getTime() < Date.now() - 60 * 1000) {
    throw new AppError("Choose a time in the future.", 422, "TIME_IN_PAST");
  }

  const order = await LabOrder.create({
    facilityId: facility._id,
    patientId: patient._id,
    testId: test._id,
    testName: test.name,
    testCode: test.code || undefined,
    category: test.category || undefined,
    sampleType: test.sampleType || undefined,
    urgency: body.urgency === "URGENT" ? "URGENT" : "ROUTINE",
    status: LAB_ORDER_STATUS.REQUESTED,
    requestedBy: user._id,
    scheduledAt: when || undefined,
    collectionAddress:
      test.homeCollection && body.collectionAddress
        ? String(body.collectionAddress).slice(0, 300)
        : undefined,
    remarks: String(body.notes || "").slice(0, 500) || undefined,
    history: [
      {
        status: LAB_ORDER_STATUS.REQUESTED,
        actorId: user._id,
        facilityId: facility._id,
        note: when
          ? `Self-booked from the user app for ${when.toISOString()}.`
          : "Self-booked from the user app.",
      },
    ],
  });

  return serializeLabOrder(order, facility);
}

function serializeLabOrder(row, facility, extra = {}) {
  const o = row.toObject ? row.toObject() : row;
  return {
    id: String(o._id),
    testName: o.testName,
    testCode: o.testCode || "",
    category: o.category || "",
    sampleType: o.sampleType || "",
    urgency: o.urgency || "ROUTINE",
    status: o.status,
    nextStatuses: LAB_ORDER_TRANSITIONS[o.status] || [],
    results: o.results || [],
    remarks: o.remarks || "",
    reviewerName: o.reviewerName || "",
    reportDate: o.reportDate || null,
    reportReadyAt: o.reportReadyAt || null,
    sampleCollectedAt: o.sampleCollectedAt || null,
    history: o.history || [],
    scheduledAt: o.scheduledAt || null,
    collectionAddress: o.collectionAddress || "",
    reportReady: [LAB_ORDER_STATUS.REPORT_READY, LAB_ORDER_STATUS.DELIVERED].includes(o.status),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    facility: facility ? publicFacility(facility, extra.loc) : null,
  };
}

/** GET /api/mobile/lab-orders — the patient's bookings, newest first. */
export async function listLabOrders(patientId) {
  const rows = await LabOrder.find({ patientId }).sort({ createdAt: -1 }).limit(80);
  const facilities = await Facility.find({ _id: { $in: rows.map((r) => r.facilityId) } }).select(
    "name type address city district state pin geo contactNumber operatingHours emergencyAvailable"
  );
  const map = Object.fromEntries(facilities.map((f) => [String(f._id), f]));
  return rows.map((r) => serializeLabOrder(r, map[String(r.facilityId)]));
}

/** GET /api/mobile/lab-orders/:id */
export async function getLabOrder(patientId, id) {
  const row = await LabOrder.findOne({ _id: assertObjectId(id, "bookingId", "BOOKING_INVALID"), patientId });
  if (!row) throw new AppError("That booking was not found.", 404, "NOT_FOUND");
  const facility = await Facility.findById(row.facilityId);
  return serializeLabOrder(row, facility);
}

/**
 * POST /api/mobile/lab-orders/:id/cancel — only while the lab has not started.
 * Once a sample is collected the lab owns the record; a patient-side delete
 * would erase work that has already happened.
 */
export async function cancelLabOrder(userId, patientId, id) {
  const row = await LabOrder.findOne({ _id: assertObjectId(id, "bookingId", "BOOKING_INVALID"), patientId });
  if (!row) throw new AppError("That booking was not found.", 404, "NOT_FOUND");
  const cancellable = [LAB_ORDER_STATUS.REQUESTED, LAB_ORDER_STATUS.ACCEPTED, LAB_ORDER_STATUS.SAMPLE_PENDING];
  if (!cancellable.includes(row.status)) {
    throw new AppError("This booking can no longer be cancelled. Please contact the lab.", 409, "NOT_CANCELLABLE");
  }
  row.status = LAB_ORDER_STATUS.REJECTED;
  row.history.push({
    status: LAB_ORDER_STATUS.REJECTED,
    actorId: userId,
    facilityId: row.facilityId,
    note: "Cancelled by the patient from the app.",
  });
  await row.save();
  const facility = await Facility.findById(row.facilityId);
  return serializeLabOrder(row, facility);
}

/**
 * GET /api/mobile/referrals — the referral trail between facilities for this
 * patient, with the timeline expanded into named places. Read-only: only a
 * doctor creates or moves a referral.
 */
export async function listPatientReferrals(patientId) {
  const rows = await Referral.find({ patientId }).sort({ createdAt: -1 }).limit(50);
  const facIds = [...new Set(rows.flatMap((r) => [String(r.fromFacilityId), String(r.toFacilityId)]))];
  const docIds = [...new Set(rows.flatMap((r) => [String(r.fromDoctorUserId), String(r.toDoctorUserId)].filter(Boolean)))];
  const [facilities, doctors] = await Promise.all([
    Facility.find({ _id: { $in: facIds } }).select("name type city district contactNumber address"),
    User.find({ _id: { $in: docIds } }).select("name"),
  ]);
  const facMap = Object.fromEntries(facilities.map((f) => [String(f._id), f]));
  const docMap = Object.fromEntries(doctors.map((d) => [String(d._id), d]));
  const brief = (f) =>
    f ? { id: String(f._id), name: f.name, type: f.type, city: f.city, district: f.district, contactNumber: f.contactNumber } : null;

  return rows.map((r) => {
    const o = r.toObject();
    return {
      id: String(o._id),
      reason: o.reason,
      specialty: o.specialty || "",
      priority: o.priority || "ROUTINE",
      status: o.status,
      from: brief(facMap[String(o.fromFacilityId)]),
      fromDoctor: docMap[String(o.fromDoctorUserId)]?.name || "",
      to: brief(facMap[String(o.toFacilityId)]),
      toDoctor: o.toDoctorUserId ? docMap[String(o.toDoctorUserId)]?.name || "" : "",
      appointmentId: o.appointmentId ? String(o.appointmentId) : null,
      timeline: (o.timeline || []).map((t) => ({
        status: t.status,
        at: t.at,
        note: t.note || "",
        actor: t.actorId ? docMap[String(t.actorId)]?.name || "" : "",
        facility: t.facilityId ? facMap[String(t.facilityId)]?.name || "" : "",
      })),
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    };
  });
}
