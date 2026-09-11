import crypto from "crypto";
import {
  Facility,
  MedicineItem,
  MedicineRequest,
  PharmacyAreaRequest,
} from "../models/index.js";
import {
  FACILITY_STATUS,
  MEDICINE_STATUS,
  PHARMACY_KINDS,
  PROCUREMENT_LIST_BUCKETS,
  PROCUREMENT_STATUS as S,
  PROCUREMENT_TRANSITIONS,
} from "../utils/constants.js";
import { AppError, asyncHandler } from "../utils/errors.js";
import { writeAudit } from "../services/audit.service.js";
import { notifyFacilityUsers } from "../services/notify.service.js";

function n(v) {
  return String(v || "")
    .trim()
    .toLowerCase();
}

function eqLoc(a, b) {
  return n(a) && n(a) === n(b);
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function haversineKm(a, b) {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)) * 10) / 10;
}

function formatHours(hours) {
  if (!hours?.length) return "Hours not listed";
  const open = hours.filter((h) => !h.closed);
  if (!open.length) return "Closed";
  const first = open[0];
  return `${open.length} day(s) · typically ${first.open}–${first.close}`;
}

function locationMeta(buyer, pharmacy) {
  const sameCity = eqLoc(buyer.city, pharmacy.city);
  const sameDistrict = eqLoc(buyer.district, pharmacy.district);
  const sameState = eqLoc(buyer.state, pharmacy.state);
  if (sameCity) return { rank: 1, label: "Same City", group: "AVAILABLE_NEAR_YOU" };
  if (sameDistrict) return { rank: 2, label: "Same District", group: "SAME_DISTRICT" };
  if (sameState) return { rank: 3, label: "Nearby Area", group: "NEARBY" };
  return { rank: 4, label: "Other Location", group: "OTHER" };
}

function publicPharmacy(pharmacy, extra = {}) {
  return {
    _id: pharmacy._id,
    name: pharmacy.name,
    verified: pharmacy.status === FACILITY_STATUS.VERIFIED,
    city: pharmacy.city,
    district: pharmacy.district,
    state: pharmacy.state,
    pin: pharmacy.pin,
    address: pharmacy.address,
    contactNumber: pharmacy.contactNumber,
    operatingHours: formatHours(pharmacy.operatingHours),
    deliveryAvailable: !!pharmacy.deliveryAvailable,
    pickupAvailable: pharmacy.pickupAvailable !== false,
    ...extra,
  };
}

function matchInventory(item, inventory) {
  const name = n(item.name);
  const generic = n(item.genericName);
  const brand = n(item.brandName);
  const strength = n(item.strength);
  const form = n(item.dosageForm);
  const hits = inventory.filter((m) => {
    const blob = `${n(m.name)} ${n(m.genericName)} ${n(m.brandName)}`;
    const nameHit =
      (name && (n(m.name) === name || n(m.genericName) === name || blob.includes(name))) ||
      (generic && (n(m.genericName) === generic || n(m.name) === generic || blob.includes(generic)));
    if (!nameHit) return false;
    if (strength && n(m.strength) && n(m.strength) !== strength && !n(m.strength).includes(strength) && !strength.includes(n(m.strength))) {
      return false;
    }
    if (form && n(m.dosageForm) && n(m.dosageForm) !== form) return false;
    if (brand && n(m.brandName) && n(m.brandName) !== brand && !blob.includes(brand)) return false;
    return true;
  });
  const availableQty = hits.reduce((sum, m) => sum + (Number(m.quantity) || 0), 0);
  const requested = Number(item.requestedQty) || 0;
  let status = "UNAVAILABLE";
  if (availableQty >= requested && requested > 0) status = "AVAILABLE";
  else if (availableQty > 0) status = "PARTIAL";
  return {
    availableQty,
    status,
    prescriptionRequired: hits.some((h) => h.prescriptionRequired),
    best: hits.sort((a, b) => (b.quantity || 0) - (a.quantity || 0))[0],
  };
}

function cleanHistory(history) {
  return (history || []).map((h) => ({
    status: h.status,
    at: h.at,
    note: h.note && /^[a-f0-9]{64}$/i.test(h.note) ? undefined : h.note,
  }));
}

function sanitizeBuyerRequest(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  const pharmacy = o.pharmacyFacilityId && o.pharmacyFacilityId.name ? publicPharmacy(o.pharmacyFacilityId) : undefined;
  return {
    _id: o._id,
    requestNo: o.requestNo,
    requestGroupId: o.requestGroupId,
    status: o.status,
    urgency: o.urgency,
    notes: o.notes,
    items: o.items,
    fulfillment: o.fulfillment || "",
    paymentStatus: o.paymentStatus || "NOT_REQUIRED",
    stockReserved: !!o.stockReserved,
    deliveryCharge: o.deliveryCharge,
    medicinesTotal: o.medicinesTotal,
    grandTotal: o.grandTotal,
    quoteSubmitted: o.quoteSubmitted,
    quoteAcceptedAt: o.quoteAcceptedAt,
    rejectionReason: o.rejectionReason,
    expiresAt: o.expiresAt,
    history: cleanHistory(o.history),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    pharmacy,
    pharmacyFacilityId: pharmacy?._id || o.pharmacyFacilityId,
  };
}

function sanitizePharmacyRequest(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  const from = o.fromFacilityId;
  return {
    _id: o._id,
    requestNo: o.requestNo,
    requestGroupId: o.requestGroupId,
    status: o.status,
    urgency: o.urgency,
    notes: o.notes,
    items: o.items,
    fulfillment: o.fulfillment || "",
    paymentStatus: o.paymentStatus || "NOT_REQUIRED",
    stockReserved: !!o.stockReserved,
    deliveryCharge: o.deliveryCharge,
    medicinesTotal: o.medicinesTotal,
    grandTotal: o.grandTotal,
    quoteSubmitted: o.quoteSubmitted,
    quoteAcceptedAt: o.quoteAcceptedAt,
    rejectionReason: o.rejectionReason,
    expiresAt: o.expiresAt,
    history: cleanHistory(o.history),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    orderedBy: o.createdBy?.name,
    fromFacility: from?.name
      ? {
          _id: from._id,
          name: from.name,
          type: from.type,
          city: from.city,
          district: from.district,
          state: from.state,
          pin: from.pin,
          address: from.address,
          contactNumber: from.contactNumber,
        }
      : undefined,
  };
}

function pushHistory(doc, req, status, note) {
  doc.history = doc.history || [];
  doc.history.push({
    status,
    at: new Date(),
    actorId: req.user._id,
    facilityId: req.facilityId,
    note,
  });
}

async function nextRequestNo() {
  const y = new Date().getFullYear();
  const prefix = `MR-${y}-`;
  const last = await MedicineRequest.findOne({ requestNo: new RegExp(`^${prefix}`) }).sort({ requestNo: -1 }).select("requestNo");
  const n = last?.requestNo ? Number(last.requestNo.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(5, "0")}`;
}

function assertTransition(from, to) {
  const allowed = PROCUREMENT_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) throw new AppError(`Cannot move from ${from} to ${to}.`, 422, "INVALID_STATUS");
}

async function expireIfNeeded(doc) {
  if (!doc.expiresAt || doc.expiresAt > new Date()) return doc;
  if ([S.PENDING, S.REQUESTED, S.PHARMACY_REVIEWING].includes(doc.status)) {
    doc.status = S.EXPIRED;
    doc.history.push({ status: S.EXPIRED, at: new Date(), note: "Request expired" });
    await doc.save();
  }
  return doc;
}

async function buyerOwns(req, id) {
  const doc = await MedicineRequest.findOne({ _id: id, fromFacilityId: req.facilityId }).populate(
    "pharmacyFacilityId",
    "name city district state pin address contactNumber operatingHours deliveryAvailable pickupAvailable status type"
  );
  if (!doc) throw new AppError("Medicine request not found.", 404, "NOT_FOUND");
  return expireIfNeeded(doc);
}

async function pharmacyOwns(req, id) {
  const doc = await MedicineRequest.findOne({ _id: id, pharmacyFacilityId: req.facilityId })
    .populate("fromFacilityId", "name type city district state pin address contactNumber")
    .populate("createdBy", "name");
  if (!doc) throw new AppError("Medicine request not found.", 404, "NOT_FOUND");
  return expireIfNeeded(doc);
}

function totalsFromItems(items, deliveryCharge) {
  let medicinesTotal = 0;
  const next = items.map((it) => {
    const qty = Number(it.offeredQty != null ? it.offeredQty : it.requestedQty) || 0;
    const unit = it.unitPrice != null ? Number(it.unitPrice) : undefined;
    const subtotal = unit != null ? Math.round(unit * qty * 100) / 100 : undefined;
    if (subtotal != null) medicinesTotal += subtotal;
    return { ...it, unitPrice: unit, subtotal };
  });
  const delivery = Number(deliveryCharge) || 0;
  const grandTotal = medicinesTotal ? Math.round((medicinesTotal + delivery) * 100) / 100 : delivery || undefined;
  return { items: next, medicinesTotal: medicinesTotal || undefined, grandTotal, deliveryCharge: delivery };
}

function normalizeCartItems(raw) {
  const items = (raw || []).map((it) => ({
    name: String(it.name || "").trim(),
    genericName: String(it.genericName || "").trim(),
    brandName: String(it.brandName || "").trim(),
    strength: String(it.strength || "").trim(),
    dosageForm: String(it.dosageForm || "").trim(),
    notes: String(it.notes || "").slice(0, 200),
    requestedQty: Math.max(1, Number(it.requestedQty) || 1),
  }));
  if (!items.length || items.some((i) => i.name.length < 2)) {
    throw new AppError("Add at least one named medicine with a quantity.", 422, "ITEMS_INVALID");
  }
  return items;
}

async function verifiedPharmacies() {
  return Facility.find({
    type: { $in: PHARMACY_KINDS },
    status: FACILITY_STATUS.VERIFIED,
  }).select("name city district state pin address contactNumber operatingHours deliveryAvailable pickupAvailable geo status type");
}

async function decrementStock(pharmacyId, item, qty) {
  const inventory = await MedicineItem.find({ facilityId: pharmacyId, status: MEDICINE_STATUS.ACTIVE });
  const { best, availableQty } = matchInventory(item, inventory);
  if (!best || availableQty < qty) {
    throw new AppError(`Insufficient stock for ${item.name}.`, 409, "INSUFFICIENT_STOCK");
  }
  const updated = await MedicineItem.findOneAndUpdate(
    { _id: best._id, facilityId: pharmacyId, quantity: { $gte: qty } },
    { $inc: { quantity: -qty } },
    { new: true }
  );
  if (!updated) throw new AppError(`Stock changed for ${item.name}. Refresh and try again.`, 409, "STOCK_RACE");
  return updated._id;
}

async function restoreStock(pharmacyId, item, qty) {
  const inventory = await MedicineItem.find({ facilityId: pharmacyId, status: MEDICINE_STATUS.ACTIVE });
  const { best } = matchInventory(item, inventory);
  if (!best) return;
  await MedicineItem.updateOne({ _id: best._id, facilityId: pharmacyId }, { $inc: { quantity: qty } });
}

export const procurementController = {
  searchMedicines: asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json({ medicines: [] });
    const pharmacies = await verifiedPharmacies();
    const ids = pharmacies.map((p) => p._id);
    if (!ids.length) return res.json({ medicines: [] });
    const re = new RegExp(escapeRe(q), "i");
    const rows = await MedicineItem.find({
      facilityId: { $in: ids },
      status: MEDICINE_STATUS.ACTIVE,
      $or: [{ name: re }, { genericName: re }, { brandName: re }, { strength: re }, { dosageForm: re }],
    })
      .select("name genericName brandName strength dosageForm quantity prescriptionRequired")
      .limit(80);

    const map = new Map();
    for (const m of rows) {
      const key = [n(m.name), n(m.genericName), n(m.brandName), n(m.strength), n(m.dosageForm)].join("|");
      const prev = map.get(key) || {
        name: m.name,
        genericName: m.genericName,
        brandName: m.brandName,
        strength: m.strength,
        dosageForm: m.dosageForm,
        prescriptionRequired: false,
        listedQty: 0,
        pharmacies: 0,
      };
      prev.listedQty += Number(m.quantity) || 0;
      prev.pharmacies += 1;
      prev.prescriptionRequired = prev.prescriptionRequired || !!m.prescriptionRequired;
      map.set(key, prev);
    }
    const medicines = [...map.values()].slice(0, 20).map((m) => ({
      ...m,
      availability: m.listedQty > 0 ? "Available at verified pharmacies" : "Listed (currently out of stock)",
    }));
    res.json({ medicines });
  }),

  findPharmacies: asyncHandler(async (req, res) => {
    const buyer = req.facility;
    if (!buyer.city && !buyer.district) {
      throw new AppError("Your facility has no registered location. Add city and district in Settings before searching pharmacies.", 422, "NO_LOCATION");
    }
    const items = normalizeCartItems(req.body.items);
    const nearby = req.body.nearby === true;
    const pharmacies = await verifiedPharmacies();
    const inventory = await MedicineItem.find({
      facilityId: { $in: pharmacies.map((p) => p._id) },
      status: MEDICINE_STATUS.ACTIVE,
    }).select("facilityId name genericName brandName strength dosageForm quantity prescriptionRequired");

    const byPharm = new Map();
    for (const m of inventory) {
      const id = String(m.facilityId);
      if (!byPharm.has(id)) byPharm.set(id, []);
      byPharm.get(id).push(m);
    }

    const ranked = pharmacies.map((p) => {
      const loc = locationMeta(buyer, p);
      const stock = byPharm.get(String(p._id)) || [];
      const lines = items.map((it) => {
        const match = matchInventory(it, stock);
        return {
          name: it.name,
          genericName: it.genericName,
          brandName: it.brandName,
          strength: it.strength,
          dosageForm: it.dosageForm,
          requestedQty: it.requestedQty,
          availableQty: match.availableQty,
          status: match.status,
          prescriptionRequired: match.prescriptionRequired,
        };
      });
      const availableCount = lines.filter((l) => l.status === "AVAILABLE" || l.status === "PARTIAL").length;
      const fullCount = lines.filter((l) => l.status === "AVAILABLE").length;
      const distanceKm = haversineKm(buyer.geo, p.geo);
      return {
        pharmacy: publicPharmacy(p, {
          locationLabel: loc.label,
          group: loc.group,
          rank: loc.rank,
          ...(distanceKm != null ? { distanceKm } : {}),
          availableMedicines: availableCount,
          requestedMedicines: items.length,
          fullyAvailable: fullCount,
        }),
        lines,
      };
    });

    ranked.sort((a, b) => {
      if (a.pharmacy.rank !== b.pharmacy.rank) return a.pharmacy.rank - b.pharmacy.rank;
      if (a.pharmacy.distanceKm != null && b.pharmacy.distanceKm != null) return a.pharmacy.distanceKm - b.pharmacy.distanceKm;
      return b.pharmacy.availableMedicines - b.pharmacy.availableMedicines;
    });

    const hasLocal = ranked.some((r) => r.pharmacy.rank <= 2);
    const filtered = nearby || !hasLocal ? ranked : ranked.filter((r) => r.pharmacy.rank <= 3);

    const groups = {
      AVAILABLE_NEAR_YOU: filtered.filter((r) => r.pharmacy.group === "AVAILABLE_NEAR_YOU"),
      SAME_DISTRICT: filtered.filter((r) => r.pharmacy.group === "SAME_DISTRICT"),
      NEARBY: filtered.filter((r) => r.pharmacy.group === "NEARBY"),
      OTHER: filtered.filter((r) => r.pharmacy.group === "OTHER"),
    };

    const nearbyCities = [...new Set(pharmacies.filter((p) => eqLoc(p.state, buyer.state) && !eqLoc(p.city, buyer.city)).map((p) => p.city))].filter(Boolean);
    const nearbyDistricts = [...new Set(pharmacies.filter((p) => eqLoc(p.state, buyer.state) && !eqLoc(p.district, buyer.district)).map((p) => p.district))].filter(Boolean);

    res.json({
      origin: { city: buyer.city, district: buyer.district, state: buyer.state, pin: buyer.pin },
      emptyLocal: !hasLocal,
      groups,
      nearbyCities,
      nearbyDistricts,
      total: filtered.length,
    });
  }),

  pharmacyPublic: asyncHandler(async (req, res) => {
    const pharmacy = await Facility.findOne({
      _id: req.params.pharmacyId,
      type: { $in: PHARMACY_KINDS },
      status: FACILITY_STATUS.VERIFIED,
    }).select("name city district state pin address contactNumber operatingHours deliveryAvailable pickupAvailable status type geo");
    if (!pharmacy) throw new AppError("Pharmacy not found or not available for orders.", 404, "NOT_FOUND");
    const items = req.body.items?.length ? normalizeCartItems(req.body.items) : [];
    let lines = [];
    if (items.length) {
      const stock = await MedicineItem.find({ facilityId: pharmacy._id, status: MEDICINE_STATUS.ACTIVE }).select(
        "name genericName brandName strength dosageForm quantity prescriptionRequired"
      );
      lines = items.map((it) => {
        const match = matchInventory(it, stock);
        return {
          name: it.name,
          genericName: it.genericName,
          brandName: it.brandName,
          strength: it.strength,
          dosageForm: it.dosageForm,
          requestedQty: it.requestedQty,
          availableQty: match.availableQty,
          status: match.status,
          prescriptionRequired: match.prescriptionRequired,
        };
      });
    }
    const loc = locationMeta(req.facility, pharmacy);
    const distanceKm = haversineKm(buyerGeo(req.facility), pharmacy.geo);
    res.json({
      pharmacy: publicPharmacy(pharmacy, {
        locationLabel: loc.label,
        ...(distanceKm != null ? { distanceKm } : {}),
      }),
      lines,
    });
  }),

  send: asyncHandler(async (req, res) => {
    const items = normalizeCartItems(req.body.items);
    const pharmacyIds = [...new Set((req.body.pharmacyIds || []).map(String))];
    if (!pharmacyIds.length) throw new AppError("Select at least one pharmacy.", 422, "PHARMACY_REQUIRED");
    if (pharmacyIds.length > 8) throw new AppError("You can request at most 8 pharmacies at once.", 422, "TOO_MANY");
    const notes = String(req.body.notes || "").slice(0, 500);
    if (/\b(patient|mrn|diagnosis|aadhaar|ssn)\b/i.test(notes)) {
      throw new AppError("Do not include patient or clinical identifiers in procurement notes.", 422, "NOTES_RESTRICTED");
    }
    const urgency = req.body.urgency === "URGENT" ? "URGENT" : "NORMAL";
    let fulfillment = String(req.body.fulfillment || "").toUpperCase();
    if (fulfillment && !["DELIVERY", "PICKUP"].includes(fulfillment)) {
      throw new AppError("Choose delivery or pickup.", 422, "FULFILLMENT_INVALID");
    }
    const pharmacies = await Facility.find({
      _id: { $in: pharmacyIds },
      type: { $in: PHARMACY_KINDS },
      status: FACILITY_STATUS.VERIFIED,
    });
    if (pharmacies.length !== pharmacyIds.length) {
      throw new AppError("One or more pharmacies are not verified or cannot receive orders.", 422, "INVALID_PHARMACY");
    }

    const fingerprint = crypto.createHash("sha256").update(JSON.stringify({ items, pharmacyIds: pharmacyIds.sort(), notes })).digest("hex");
    const recent = await MedicineRequest.findOne({
      fromFacilityId: req.facilityId,
      createdAt: { $gt: new Date(Date.now() - 20 * 1000) },
      "history.note": fingerprint,
    });
    if (recent) throw new AppError("This request was just submitted. Wait a moment before sending again.", 409, "DUPLICATE");

    const requestGroupId = crypto.randomUUID();
    const created = [];
    for (const pharmacy of pharmacies) {
      const stock = await MedicineItem.find({ facilityId: pharmacy._id, status: MEDICINE_STATUS.ACTIVE });
      const lined = items.map((it) => {
        const match = matchInventory(it, stock);
        return {
          ...it,
          availableQty: match.availableQty,
          prescriptionRequired: match.prescriptionRequired,
          authRequired: !!match.prescriptionRequired,
        };
      });
      const short = lined.filter((it) => it.availableQty < it.requestedQty);
      if (short.length) {
        const msg = short
          .map((it) => `${it.name} ${it.strength || ""} — requested ${it.requestedQty}, available ${it.availableQty}`)
          .join("; ");
        throw new AppError(`Cannot order unavailable quantity from ${pharmacy.name}. ${msg}`, 422, "INSUFFICIENT_STOCK");
      }
      const method = fulfillment || (pharmacy.deliveryAvailable ? "DELIVERY" : "PICKUP");
      if (method === "DELIVERY" && pharmacy.deliveryAvailable === false && pharmacy.pickupAvailable !== false) {
        /* fall back to pickup if shop does not deliver */
      }
      const chosen = method === "DELIVERY" && pharmacy.deliveryAvailable === false ? "PICKUP" : method;
      const doc = await MedicineRequest.create({
        requestNo: await nextRequestNo(),
        requestGroupId,
        fromFacilityId: req.facilityId,
        pharmacyFacilityId: pharmacy._id,
        createdBy: req.user._id,
        status: S.PENDING,
        urgency,
        notes,
        items: lined,
        fulfillment: chosen,
        paymentStatus: "NOT_REQUIRED",
        expiresAt: new Date(Date.now() + 7 * 86400000),
        history: [{ status: S.PENDING, at: new Date(), actorId: req.user._id, facilityId: req.facilityId, note: fingerprint }],
      });
      created.push(doc);
      await notifyFacilityUsers(pharmacy._id, {
        title: urgency === "URGENT" ? "Urgent medicine request" : "New medicine request",
        body: `${req.facility.name} requested ${items.length} medicine(s) (${doc.requestNo}).`,
        kind: "SYSTEM",
        channel: "system",
      });
      await writeAudit(req, {
        action: "MEDICINE_REQUEST_SENT",
        resource: "MedicineRequest",
        resourceId: doc._id,
        facilityId: req.facilityId,
        metadata: { pharmacyId: String(pharmacy._id), requestGroupId },
      });
    }
    await writeAudit(req, {
      action: "MEDICINE_REQUEST_CREATED",
      resource: "MedicineRequest",
      resourceId: created[0]._id,
      facilityId: req.facilityId,
      metadata: { requestGroupId, count: created.length },
    });
    await notifyFacilityUsers(req.facilityId, {
      title: "Medicine request sent",
      body: `Request sent to ${created.length} pharmacy(ies).`,
      kind: "SYSTEM",
      channel: "system",
    });
    res.status(201).json({
      requestGroupId,
      requests: created.map((d) => ({ _id: d._id, requestNo: d.requestNo, pharmacyFacilityId: d.pharmacyFacilityId, status: d.status })),
      message: `Order ${created[0].requestNo} placed.`,
    });
  }),

  listMine: asyncHandler(async (req, res) => {
    const filter = { fromFacilityId: req.facilityId };
    const tab = String(req.query.tab || "ALL");
    const map = {
      PENDING: [S.PENDING, S.REQUESTED, S.PHARMACY_REVIEWING],
      ACCEPTED: [S.ACCEPTED, S.PARTIALLY_AVAILABLE],
      PREPARING: [S.ORDER_CONFIRMED, S.PREPARING],
      READY: [S.READY, S.READY_FOR_PICKUP],
      OUT_FOR_DELIVERY: [S.OUT_FOR_DELIVERY],
      READY_FOR_PICKUP: [S.READY_FOR_PICKUP],
      COMPLETED: [S.DELIVERED, S.COLLECTED, S.COMPLETED],
      REJECTED: [S.REJECTED, S.EXPIRED],
      CANCELLED: [S.CANCELLED],
    };
    if (map[tab]) filter.status = { $in: map[tab] };
    const rows = await MedicineRequest.find(filter)
      .populate("pharmacyFacilityId", "name city district state pin address contactNumber operatingHours deliveryAvailable pickupAvailable status type")
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({
      requests: rows.map((r) => {
        const s = sanitizeBuyerRequest(r);
        return {
          ...s,
          medicineCount: oItems(r),
          totalQty: r.items.reduce((sum, i) => sum + (i.requestedQty || 0), 0),
        };
      }),
    });
  }),

  oneMine: asyncHandler(async (req, res) => {
    const doc = await buyerOwns(req, req.params.id);
    const siblings = await MedicineRequest.find({ requestGroupId: doc.requestGroupId, fromFacilityId: req.facilityId }).populate(
      "pharmacyFacilityId",
      "name city district state pin address contactNumber operatingHours deliveryAvailable pickupAvailable status type"
    );
    const groupFulfilled = siblings.some((s) => [S.ORDER_CONFIRMED, S.PREPARING, S.READY, S.READY_FOR_PICKUP, S.OUT_FOR_DELIVERY, S.DELIVERED, S.COLLECTED, S.COMPLETED].includes(s.status));
    res.json({
      request: sanitizeBuyerRequest(doc),
      siblings: siblings.map(sanitizeBuyerRequest),
      groupFulfilled,
    });
  }),

  cancelMine: asyncHandler(async (req, res) => {
    const doc = await buyerOwns(req, req.params.id);
    if ([S.DELIVERED, S.COLLECTED, S.COMPLETED].includes(doc.status)) {
      throw new AppError("Completed orders cannot be cancelled.", 422, "LOCKED");
    }
    const wasConfirmed = [S.ACCEPTED, S.PARTIALLY_AVAILABLE, S.ORDER_CONFIRMED, S.PREPARING, S.READY, S.READY_FOR_PICKUP, S.OUT_FOR_DELIVERY].includes(doc.status) && doc.stockReserved;
    if (wasConfirmed) {
      for (const it of doc.items) {
        const qty = Number(it.offeredQty != null ? it.offeredQty : it.requestedQty) || 0;
        if (qty) await restoreStock(doc.pharmacyFacilityId._id || doc.pharmacyFacilityId, it, qty);
      }
      doc.stockReserved = false;
    }
    assertTransition(doc.status, S.CANCELLED);
    doc.status = S.CANCELLED;
    pushHistory(doc, req, S.CANCELLED, req.body.reason);
    await doc.save();
    await writeAudit(req, { action: "ORDER_CANCELLED", resource: "MedicineRequest", resourceId: doc._id, facilityId: req.facilityId });
    await notifyFacilityUsers(doc.pharmacyFacilityId._id || doc.pharmacyFacilityId, {
      title: "Medicine request cancelled",
      body: `${doc.requestNo} was cancelled by the facility.`,
      kind: "SYSTEM",
      channel: "system",
    });
    res.json({ request: sanitizeBuyerRequest(doc), message: "Request cancelled." });
  }),

  cancelOutstanding: asyncHandler(async (req, res) => {
    const doc = await buyerOwns(req, req.params.id);
    const keep = [S.ORDER_CONFIRMED, S.PREPARING, S.READY_FOR_PICKUP, S.OUT_FOR_DELIVERY, S.DELIVERED, S.COLLECTED, S.COMPLETED, S.CANCELLED, S.REJECTED, S.EXPIRED];
    const siblings = await MedicineRequest.find({
      requestGroupId: doc.requestGroupId,
      fromFacilityId: req.facilityId,
      _id: { $ne: doc._id },
      status: { $nin: keep },
    });
    for (const s of siblings) {
      s.status = S.CANCELLED;
      s.history.push({ status: S.CANCELLED, at: new Date(), actorId: req.user._id, facilityId: req.facilityId, note: "Cancelled as another pharmacy fulfilled the requirement" });
      await s.save();
      await notifyFacilityUsers(s.pharmacyFacilityId, {
        title: "Medicine request cancelled",
        body: `${s.requestNo} was cancelled because another pharmacy is fulfilling the order.`,
        kind: "SYSTEM",
        channel: "system",
      });
    }
    res.json({ cancelled: siblings.length, message: "Outstanding requests to other pharmacies were cancelled." });
  }),

  acceptQuote: asyncHandler(async (req, res) => {
    const doc = await buyerOwns(req, req.params.id);
    if (!doc.quoteSubmitted) throw new AppError("No quotation to accept.", 422, "NO_QUOTE");
    if (![S.ACCEPTED, S.PARTIALLY_AVAILABLE].includes(doc.status)) {
      throw new AppError("Quotation can only be accepted after the pharmacy responds.", 422, "INVALID_STATUS");
    }
    doc.quoteAcceptedAt = new Date();
    pushHistory(doc, req, doc.status, "Quotation accepted");
    await doc.save();
    await notifyFacilityUsers(doc.pharmacyFacilityId._id || doc.pharmacyFacilityId, {
      title: "Quotation accepted",
      body: `${req.facility.name} accepted the quotation for ${doc.requestNo}.`,
      kind: "SYSTEM",
      channel: "system",
    });
    res.json({ request: sanitizeBuyerRequest(doc), message: "Quotation accepted. Confirm the order when ready." });
  }),

  rejectQuote: asyncHandler(async (req, res) => {
    const doc = await buyerOwns(req, req.params.id);
    if (!doc.quoteSubmitted) throw new AppError("No quotation to reject.", 422, "NO_QUOTE");
    await notifyFacilityUsers(doc.pharmacyFacilityId._id || doc.pharmacyFacilityId, {
      title: "Quotation not accepted",
      body: `${req.facility.name} requested clarification or declined the quotation for ${doc.requestNo}.`,
      kind: "SYSTEM",
      channel: "system",
    });
    pushHistory(doc, req, doc.status, req.body.note || "Quotation rejected / clarification requested");
    await doc.save();
    res.json({ request: sanitizeBuyerRequest(doc), message: "Pharmacy has been notified." });
  }),

  confirmOrder: asyncHandler(async (req, res) => {
    const doc = await buyerOwns(req, req.params.id);
    if (![S.ACCEPTED, S.PARTIALLY_AVAILABLE].includes(doc.status)) {
      throw new AppError("The pharmacy must accept this request before you confirm an order.", 422, "NOT_ACCEPTED");
    }
    if (!doc.fulfillment) throw new AppError("Pharmacy has not selected delivery or pickup yet.", 422, "NO_FULFILLMENT");
    if (doc.quoteSubmitted && !doc.quoteAcceptedAt) {
      throw new AppError("Accept the quotation before confirming this order.", 422, "QUOTE_PENDING");
    }
    const siblings = await MedicineRequest.find({ requestGroupId: doc.requestGroupId, fromFacilityId: req.facilityId });
    if (siblings.some((s) => String(s._id) !== String(doc._id) && [S.ORDER_CONFIRMED, S.PREPARING, S.READY, S.READY_FOR_PICKUP, S.OUT_FOR_DELIVERY, S.DELIVERED, S.COLLECTED, S.COMPLETED].includes(s.status))) {
      throw new AppError("Another pharmacy already has a confirmed order for this requirement.", 409, "ALREADY_FULFILLED");
    }
    if (!doc.stockReserved) {
      const reserved = [];
      try {
        for (const it of doc.items) {
          const qty = Number(it.offeredQty != null ? it.offeredQty : 0);
          if (qty > 0) {
            await decrementStock(doc.pharmacyFacilityId._id || doc.pharmacyFacilityId, it, qty);
            reserved.push({ it, qty });
          }
        }
      } catch (err) {
        for (const r of reserved) {
          await restoreStock(doc.pharmacyFacilityId._id || doc.pharmacyFacilityId, r.it, r.qty);
        }
        throw err;
      }
      doc.stockReserved = true;
    }
    assertTransition(doc.status, S.ORDER_CONFIRMED);
    doc.status = S.ORDER_CONFIRMED;
    pushHistory(doc, req, S.ORDER_CONFIRMED);
    await doc.save();
    const open = siblings.filter((s) => String(s._id) !== String(doc._id) && [S.REQUESTED, S.PHARMACY_REVIEWING, S.ACCEPTED, S.PARTIALLY_AVAILABLE].includes(s.status));
    for (const s of open) {
      s.status = S.CANCELLED;
      s.history.push({ status: S.CANCELLED, at: new Date(), actorId: req.user._id, facilityId: req.facilityId, note: "Cancelled after another pharmacy was confirmed" });
      await s.save();
    }
    await writeAudit(req, { action: "ORDER_CONFIRMED", resource: "MedicineRequest", resourceId: doc._id, facilityId: req.facilityId });
    await notifyFacilityUsers(doc.pharmacyFacilityId._id || doc.pharmacyFacilityId, {
      title: "Order confirmed",
      body: `${req.facility.name} confirmed ${doc.requestNo}.`,
      kind: "SYSTEM",
      channel: "system",
    });
    res.json({ request: sanitizeBuyerRequest(await buyerOwns(req, doc._id)), message: "Order confirmed." });
  }),

  requestPharmacyArea: asyncHandler(async (req, res) => {
    const f = req.facility;
    const row = await PharmacyAreaRequest.create({
      fromFacilityId: req.facilityId,
      createdBy: req.user._id,
      city: f.city,
      district: f.district,
      state: f.state,
      pin: f.pin,
      notes: String(req.body.notes || "We need a pharmacy/medical shop in this area.").slice(0, 500),
    });
    await writeAudit(req, { action: "MEDICINE_REQUEST_CREATED", resource: "PharmacyAreaRequest", resourceId: row._id, facilityId: req.facilityId });
    res.status(201).json({ request: row, message: "Registration interest recorded for your area." });
  }),

  pharmacyList: asyncHandler(async (req, res) => {
    const filter = { pharmacyFacilityId: req.facilityId };
    const bucket = String(req.query.bucket || "INCOMING");
    if (PROCUREMENT_LIST_BUCKETS[bucket]) filter.status = { $in: PROCUREMENT_LIST_BUCKETS[bucket] };
    const rows = await MedicineRequest.find(filter)
      .populate("fromFacilityId", "name type city district state pin address contactNumber")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ requests: rows.map(sanitizePharmacyRequest) });
  }),

  pharmacyOne: asyncHandler(async (req, res) => {
    const doc = await pharmacyOwns(req, req.params.id);
    const stock = await MedicineItem.find({ facilityId: req.facilityId, status: MEDICINE_STATUS.ACTIVE }).select(
      "name genericName brandName strength dosageForm quantity prescriptionRequired"
    );
    const availability = doc.items.map((it) => {
      const match = matchInventory(it, stock);
      return { name: it.name, strength: it.strength, requestedQty: it.requestedQty, availableQty: match.availableQty, status: match.status };
    });
    res.json({ request: sanitizePharmacyRequest(doc), availability });
  }),

  pharmacyRespond: asyncHandler(async (req, res) => {
    const doc = await pharmacyOwns(req, req.params.id);
    if (![S.PENDING, S.REQUESTED, S.PHARMACY_REVIEWING].includes(doc.status)) {
      throw new AppError("This request is no longer awaiting a pharmacy response.", 422, "LOCKED");
    }
    const decision = String(req.body.decision || "").toUpperCase();
    const fulfillment = String(req.body.fulfillment || doc.fulfillment || "PICKUP").toUpperCase();
    if (decision === "REJECT") {
      assertTransition(doc.status, S.REJECTED);
      doc.status = S.REJECTED;
      doc.rejectionReason = String(req.body.reason || "Unable to fulfil").slice(0, 300);
      pushHistory(doc, req, S.REJECTED, doc.rejectionReason);
      await doc.save();
      await writeAudit(req, { action: "PHARMACY_REJECTED", resource: "MedicineRequest", resourceId: doc._id, facilityId: req.facilityId });
      await notifyFacilityUsers(doc.fromFacilityId._id || doc.fromFacilityId, {
        title: "Medicine request declined",
        body: `${req.facility.name} declined ${doc.requestNo}.`,
        kind: "SYSTEM",
        channel: "system",
      });
      return res.json({ request: sanitizePharmacyRequest(doc), message: "Request rejected." });
    }

    if (!["DELIVERY", "PICKUP"].includes(fulfillment)) {
      throw new AppError("Select delivery or pickup.", 422, "FULFILLMENT_REQUIRED");
    }
    if (fulfillment === "DELIVERY" && req.facility.deliveryAvailable === false) {
      /* pharmacy may still offer delivery for this order */
    }
    const offered = req.body.items || [];
    const nextItems = doc.items.map((it, i) => {
      const row = offered[i] || offered.find((x) => n(x.name) === n(it.name) && n(x.strength) === n(it.strength)) || {};
      const offeredQty = Math.max(0, Number(row.offeredQty != null ? row.offeredQty : it.requestedQty));
      const unitPrice = row.unitPrice != null && row.unitPrice !== "" ? Number(row.unitPrice) : it.unitPrice;
      const plain = it.toObject ? it.toObject() : { ...it };
      return {
        ...plain,
        offeredQty,
        unitPrice,
        authRequired: it.prescriptionRequired ? row.authCleared !== true : false,
      };
    });
    const needsRx = nextItems.some((it) => it.prescriptionRequired && it.offeredQty > 0);
    if (needsRx && req.body.authorizationAcknowledged !== true) {
      throw new AppError("One or more items require prescription/authorization. Confirm that required documentation will be verified before accepting.", 422, "AUTH_REQUIRED");
    }
    const allFull = nextItems.every((it) => it.offeredQty >= it.requestedQty && it.offeredQty > 0);
    const any = nextItems.some((it) => it.offeredQty > 0);
    if (!any) throw new AppError("Offer at least one available quantity, or reject the request.", 422, "EMPTY_OFFER");
    const inventory = await MedicineItem.find({ facilityId: req.facilityId, status: MEDICINE_STATUS.ACTIVE });
    for (const it of nextItems) {
      if (it.offeredQty <= 0) continue;
      const match = matchInventory(it, inventory);
      if (match.availableQty < it.offeredQty) {
        throw new AppError(
          `Insufficient stock for ${it.name}${it.strength ? ` ${it.strength}` : ""}. Requested: ${it.requestedQty}. Available: ${match.availableQty}.`,
          409,
          "INSUFFICIENT_STOCK"
        );
      }
    }
    const nextStatus = allFull && decision !== "PARTIAL" ? S.ACCEPTED : S.PARTIALLY_AVAILABLE;
    assertTransition(doc.status, nextStatus);
    const priced = totalsFromItems(nextItems, req.body.deliveryCharge);
    if (!doc.stockReserved) {
      const reserved = [];
      try {
        for (const it of priced.items) {
          const qty = Number(it.offeredQty) || 0;
          if (qty > 0) {
            await decrementStock(req.facilityId, it, qty);
            reserved.push({ it, qty });
          }
        }
      } catch (err) {
        for (const r of reserved) await restoreStock(req.facilityId, r.it, r.qty);
        throw err;
      }
      doc.stockReserved = true;
    }
    doc.items = priced.items;
    doc.deliveryCharge = priced.deliveryCharge;
    doc.medicinesTotal = priced.medicinesTotal;
    doc.grandTotal = priced.grandTotal;
    doc.quoteSubmitted = nextItems.some((it) => it.unitPrice != null) || priced.deliveryCharge > 0;
    doc.fulfillment = fulfillment;
    doc.status = nextStatus;
    pushHistory(doc, req, nextStatus);
    await doc.save();
    await writeAudit(req, {
      action: nextStatus === S.ACCEPTED ? "PHARMACY_ACCEPTED" : "PHARMACY_PARTIALLY_ACCEPTED",
      resource: "MedicineRequest",
      resourceId: doc._id,
      facilityId: req.facilityId,
    });
    await notifyFacilityUsers(doc.fromFacilityId._id || doc.fromFacilityId, {
      title: nextStatus === S.ACCEPTED ? "Pharmacy accepted your request" : "Partial availability from pharmacy",
      body: `${req.facility.name} responded to ${doc.requestNo}. ${fulfillment === "DELIVERY" ? "Delivery available." : "Pickup required."}`,
      kind: "SYSTEM",
      channel: "system",
    });
    res.json({ request: sanitizePharmacyRequest(doc), message: "Response sent to the facility." });
  }),

  pharmacyAdvance: asyncHandler(async (req, res) => {
    const doc = await pharmacyOwns(req, req.params.id);
    const next = String(req.body.status || "").toUpperCase();
    assertTransition(doc.status, next);
    if (doc.fulfillment === "PICKUP" && next === S.OUT_FOR_DELIVERY) {
      throw new AppError("This order is pickup only.", 422, "PICKUP_ONLY");
    }
    if (doc.fulfillment === "DELIVERY" && (next === S.READY_FOR_PICKUP || (next === S.COMPLETED && doc.status === S.READY))) {
      if (next === S.READY_FOR_PICKUP) throw new AppError("This order is marked for delivery.", 422, "DELIVERY_ONLY");
    }
    if (doc.fulfillment === "DELIVERY" && next === S.COMPLETED && doc.status !== S.DELIVERED) {
      throw new AppError("Mark the order delivered before completing it.", 422, "DELIVERY_ONLY");
    }
    const auditMap = {
      [S.READY]: "ORDER_READY",
      [S.READY_FOR_PICKUP]: "ORDER_READY",
      [S.OUT_FOR_DELIVERY]: "ORDER_DISPATCHED",
      [S.DELIVERED]: "ORDER_DELIVERED",
      [S.COLLECTED]: "ORDER_DELIVERED",
      [S.COMPLETED]: "ORDER_COMPLETED",
    };
    doc.status = next;
    pushHistory(doc, req, next);
    await doc.save();
    if (auditMap[next]) {
      await writeAudit(req, { action: auditMap[next], resource: "MedicineRequest", resourceId: doc._id, facilityId: req.facilityId });
    }
    const titles = {
      [S.PREPARING]: "Pharmacy is preparing your order",
      [S.READY]: "Order is ready",
      [S.READY_FOR_PICKUP]: "Order ready for pickup",
      [S.OUT_FOR_DELIVERY]: "Order out for delivery",
      [S.DELIVERED]: "Order delivered",
      [S.COLLECTED]: "Order collected",
      [S.COMPLETED]: "Order completed",
    };
    if (titles[next]) {
      await notifyFacilityUsers(doc.fromFacilityId._id || doc.fromFacilityId, {
        title: titles[next],
        body: `${doc.requestNo} is now ${next.replaceAll("_", " ").toLowerCase()}.`,
        kind: "SYSTEM",
        channel: "system",
      });
    }
    res.json({ request: sanitizePharmacyRequest(doc), message: "Status updated." });
  }),
};

function oItems(r) {
  return r.items?.length || 0;
}

function buyerGeo(f) {
  return f.geo;
}
