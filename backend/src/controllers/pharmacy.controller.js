import {
  Facility,
  MedicineItem,
  MedicineRequest,
  PharmacyFulfillment,
  Prescription,
} from "../models/index.js";
import { env } from "../config/env.js";
import {
  FACILITY_STATUS,
  MEDICINE_EXPIRY_WARNING_DAYS,
  MEDICINE_STATUS,
  PHARMACY_RX_STATUS,
  PHARMACY_RX_TRANSITIONS,
  PRESCRIPTION_STATUS,
  PROCUREMENT_DISPENSED_STATUSES,
  PROCUREMENT_INCOMING_STATUSES,
  PROCUREMENT_PENDING_STATUSES,
  PROCUREMENT_READY_STATUSES,
} from "../utils/constants.js";
import { AppError, asyncHandler } from "../utils/errors.js";
import { writeAudit } from "../services/audit.service.js";
import { todayRange } from "../utils/time.js";

function sanitizeRx(rx) {
  if (!rx) return null;
  const o = rx.toObject ? rx.toObject() : rx;
  return {
    _id: o._id,
    status: o.status,
    issuedAt: o.issuedAt || o.finalizedAt,
    medicines: o.medicines?.length ? o.medicines : o.items,
    patientSnapshot: { name: o.patientSnapshot?.name, mrn: o.patientSnapshot?.mrn, age: o.patientSnapshot?.age, sex: o.patientSnapshot?.sex },
    doctorSnapshot: { name: o.doctorSnapshot?.name, registrationNumber: o.doctorSnapshot?.registrationNumber },
    letterhead: { facilityName: o.letterhead?.facilityName, city: o.letterhead?.city },
  };
}

export const pharmacyController = {
  listMedicines: asyncHandler(async (req, res) => {
    const filter = { facilityId: req.facilityId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.q) {
      const q = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: q }, { genericName: q }, { brandName: q }, { batchNumber: q }];
    }
    const medicines = await MedicineItem.find(filter).sort({ name: 1 });
    res.json({ medicines });
  }),

  createMedicine: asyncHandler(async (req, res) => {
    const b = req.body || {};
    const name = String(b.name || "").trim();
    if (name.length < 2) throw new AppError("Enter a medicine name.", 422, "NAME_INVALID");
    const medicine = await MedicineItem.create({
      facilityId: req.facilityId,
      name,
      genericName: String(b.genericName || "").trim(),
      brandName: String(b.brandName || "").trim(),
      strength: String(b.strength || "").trim(),
      dosageForm: String(b.dosageForm || "").trim(),
      manufacturer: String(b.manufacturer || "").trim(),
      batchNumber: String(b.batchNumber || "").trim(),
      expiryDate: b.expiryDate || undefined,
      quantity: Number(b.quantity || 0),
      reorderLevel: Number(b.reorderLevel != null ? b.reorderLevel : 10),
      unitPrice: b.unitPrice != null && b.unitPrice !== "" ? Number(b.unitPrice) : undefined,
      prescriptionRequired: b.prescriptionRequired !== false,
      status: b.status === MEDICINE_STATUS.INACTIVE ? MEDICINE_STATUS.INACTIVE : MEDICINE_STATUS.ACTIVE,
    });
    await writeAudit(req, { action: "MEDICINE_CREATE", resource: "MedicineItem", resourceId: medicine._id, facilityId: req.facilityId });
    res.status(201).json({ medicine, message: "Medicine added." });
  }),

  updateMedicine: asyncHandler(async (req, res) => {
    const medicine = await MedicineItem.findOne({ _id: req.params.id, facilityId: req.facilityId });
    if (!medicine) throw new AppError("Medicine not found.", 404, "NOT_FOUND");
    const b = req.body || {};
    const fields = [
      "name",
      "genericName",
      "brandName",
      "strength",
      "dosageForm",
      "manufacturer",
      "batchNumber",
      "expiryDate",
      "reorderLevel",
      "unitPrice",
      "prescriptionRequired",
      "status",
    ];
    for (const k of fields) if (b[k] !== undefined) medicine[k] = b[k];
    await medicine.save();
    await writeAudit(req, { action: "MEDICINE_UPDATE", resource: "MedicineItem", resourceId: medicine._id, facilityId: req.facilityId });
    res.json({ medicine, message: "Medicine updated." });
  }),

  adjustStock: asyncHandler(async (req, res) => {
    const medicine = await MedicineItem.findOne({ _id: req.params.id, facilityId: req.facilityId });
    if (!medicine) throw new AppError("Medicine not found.", 404, "NOT_FOUND");
    const delta = Number(req.body.delta);
    if (!Number.isFinite(delta) || delta === 0) throw new AppError("Enter a stock adjustment.", 422, "INVALID_DELTA");
    const next = medicine.quantity + delta;
    if (next < 0) throw new AppError("Stock cannot go below zero.", 422, "INSUFFICIENT_STOCK");
    medicine.quantity = next;
    await medicine.save();
    await writeAudit(req, {
      action: "INVENTORY_ADJUST",
      resource: "MedicineItem",
      resourceId: medicine._id,
      facilityId: req.facilityId,
      metadata: { delta, reason: req.body.reason, quantity: medicine.quantity },
    });
    res.json({ medicine, message: "Stock updated." });
  }),

  listOrders: asyncHandler(async (req, res) => {
    const filter = { facilityId: req.facilityId };
    if (req.query.status) filter.status = req.query.status;
    const orders = await PharmacyFulfillment.find(filter)
      .populate("patientId", "name mrn age sex allergies")
      .populate("doctorUserId", "name")
      .populate("sourceFacilityId", "name type")
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ orders });
  }),

  orderOne: asyncHandler(async (req, res) => {
    const order = await PharmacyFulfillment.findOne({ _id: req.params.id, facilityId: req.facilityId })
      .populate("patientId", "name mrn age sex allergies phone")
      .populate("doctorUserId", "name")
      .populate("sourceFacilityId", "name type city")
      .populate("dispensedBy", "name");
    if (!order) throw new AppError("Order not found.", 404, "NOT_FOUND");
    const rx = await Prescription.findById(order.prescriptionId);
    await writeAudit(req, {
      action: "PRESCRIPTION_ACCESS",
      resource: "PharmacyFulfillment",
      resourceId: order._id,
      facilityId: req.facilityId,
    });
    res.json({ order, prescription: sanitizeRx(rx) });
  }),

  updateStatus: asyncHandler(async (req, res) => {
    const order = await PharmacyFulfillment.findOne({ _id: req.params.id, facilityId: req.facilityId });
    if (!order) throw new AppError("Order not found.", 404, "NOT_FOUND");
    const next = req.body.status;
    const allowed = PHARMACY_RX_TRANSITIONS[order.status] || [];
    if (!allowed.includes(next)) throw new AppError(`Cannot move from ${order.status} to ${next}.`, 422, "INVALID_TRANSITION");
    order.status = next;
    if (next === PHARMACY_RX_STATUS.REJECTED) order.rejectionReason = req.body.reason;
    order.history.push({
      status: next,
      at: new Date(),
      actorId: req.user._id,
      facilityId: req.facilityId,
      note: req.body.note || req.body.reason,
    });
    await order.save();
    res.json({ order, message: "Order updated." });
  }),

  dispense: asyncHandler(async (req, res) => {
    const order = await PharmacyFulfillment.findOne({ _id: req.params.id, facilityId: req.facilityId });
    if (!order) throw new AppError("Order not found.", 404, "NOT_FOUND");
    if (![PHARMACY_RX_STATUS.REVIEWING, PHARMACY_RX_STATUS.DISPENSING, PHARMACY_RX_STATUS.PARTIALLY_DISPENSED].includes(order.status)) {
      throw new AppError("This order is not in a dispensable state.", 422, "INVALID_STATUS");
    }
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) throw new AppError("Select medicines to dispense.", 422, "EMPTY");
    const lines = order.lines?.length ? order.lines.map((l) => l.toObject?.() || l) : [];
    for (const item of items) {
      const qty = Number(item.quantity);
      if (!item.inventoryId || !Number.isFinite(qty) || qty <= 0) {
        throw new AppError("Each dispense line needs an inventory item and quantity.", 422, "INVALID_LINE");
      }
      const med = await MedicineItem.findOne({ _id: item.inventoryId, facilityId: req.facilityId, status: MEDICINE_STATUS.ACTIVE });
      if (!med) throw new AppError("Medicine not found in this pharmacy inventory.", 404, "NOT_FOUND");
      if (med.quantity < qty) throw new AppError(`${med.name} has insufficient stock.`, 422, "INSUFFICIENT_STOCK");
      med.quantity -= qty;
      await med.save();
      const line = lines.find((l) => String(l.prescribedName).toLowerCase() === String(item.prescribedName || med.name).toLowerCase());
      if (line) {
        line.dispensedQty = (line.dispensedQty || 0) + qty;
        line.inventoryId = med._id;
        line.batchNumber = med.batchNumber;
      } else {
        lines.push({
          prescribedName: item.prescribedName || med.name,
          prescribedQty: item.prescribedQty,
          dispensedQty: qty,
          inventoryId: med._id,
          batchNumber: med.batchNumber,
        });
      }
    }
    order.lines = lines;
    const prescribed = lines.reduce((s, l) => s + (l.prescribedQty || 0), 0);
    const dispensed = lines.reduce((s, l) => s + (l.dispensedQty || 0), 0);
    order.status = prescribed && dispensed < prescribed ? PHARMACY_RX_STATUS.PARTIALLY_DISPENSED : PHARMACY_RX_STATUS.DISPENSED;
    order.dispensedAt = new Date();
    order.dispensedBy = req.user._id;
    order.history.push({ status: order.status, at: new Date(), actorId: req.user._id, facilityId: req.facilityId, note: "Dispensed" });
    await order.save();
    await writeAudit(req, {
      action: "PRESCRIPTION_DISPENSE",
      resource: "PharmacyFulfillment",
      resourceId: order._id,
      facilityId: req.facilityId,
      metadata: { items },
    });
    res.json({ order, message: "Dispensing recorded." });
  }),

  sendFromDoctor: asyncHandler(async (req, res) => {
    const rx = await Prescription.findById(req.params.id);
    if (!rx) throw new AppError("Prescription not found.", 404, "NOT_FOUND");
    if (String(rx.facilityId) !== String(req.facilityId)) {
      throw new AppError("You cannot send this prescription.", 403, "FORBIDDEN");
    }
    if (req.user.role === "DOCTOR" && String(rx.doctorUserId) !== String(req.user._id)) {
      throw new AppError("You can only send your own prescriptions.", 403, "FORBIDDEN");
    }
    if (rx.status === PRESCRIPTION_STATUS.DRAFT) throw new AppError("Finalize the prescription before sending it to a pharmacy.", 422, "NOT_FINAL");
    const pharmacyId = req.body.pharmacyFacilityId;
    const pharmacy = await Facility.findById(pharmacyId);
    if (!pharmacy || !["PHARMACY", "MEDICINE_SHOP"].includes(pharmacy.type)) {
      throw new AppError("Select a verified pharmacy.", 422, "INVALID_PHARMACY");
    }
    if (pharmacy.status !== FACILITY_STATUS.VERIFIED) throw new AppError("That pharmacy is not verified.", 403, "NOT_VERIFIED");
    const existing = await PharmacyFulfillment.findOne({ prescriptionId: rx._id, facilityId: pharmacy._id });
    if (existing) throw new AppError("This prescription was already sent to that pharmacy.", 409, "DUPLICATE");
    const meds = rx.medicines?.length ? rx.medicines : rx.items || [];
    const order = await PharmacyFulfillment.create({
      facilityId: pharmacy._id,
      prescriptionId: rx._id,
      sourceFacilityId: rx.facilityId,
      patientId: rx.patientId,
      doctorUserId: rx.doctorUserId,
      status: PHARMACY_RX_STATUS.RECEIVED,
      lines: meds.map((m) => ({
        prescribedName: m.name || m.medicine,
        prescribedQty: 1,
        dispensedQty: 0,
      })),
      history: [{ status: PHARMACY_RX_STATUS.RECEIVED, at: new Date(), actorId: req.user._id, facilityId: req.facilityId }],
    });
    await writeAudit(req, {
      action: "PRESCRIPTION_SEND_PHARMACY",
      resource: "PharmacyFulfillment",
      resourceId: order._id,
      facilityId: req.facilityId,
      metadata: { pharmacyId: String(pharmacy._id) },
    });
    res.status(201).json({ order, message: "Prescription sent to pharmacy." });
  }),

  dashboard: asyncHandler(async (req, res) => {
    const facilityId = req.facilityId;
    const today = todayRange();
    const now = new Date();
    const warningDays =
      Number.isFinite(env.medicineExpiryWarningDays) && env.medicineExpiryWarningDays > 0
        ? env.medicineExpiryWarningDays
        : MEDICINE_EXPIRY_WARNING_DAYS;
    const soon = new Date(now.getTime() + warningDays * 86400000);
    const shopOrders = { pharmacyFacilityId: facilityId };
    const rxOrders = { facilityId };
    const stockBase = { facilityId, status: MEDICINE_STATUS.ACTIVE };

    const [
      todayMedicineOrders,
      todayRxOrders,
      pendingMedicine,
      pendingRx,
      readyMedicine,
      readyRx,
      dispensedMedicine,
      dispensedRx,
      procurementIncoming,
      prescriptionsReceived,
      lowStock,
      outOfStock,
      expiringSoon,
      recentMedicine,
      recentRx,
      facility,
    ] = await Promise.all([
      MedicineRequest.countDocuments({ ...shopOrders, createdAt: today }),
      PharmacyFulfillment.countDocuments({ ...rxOrders, createdAt: today }),
      MedicineRequest.countDocuments({ ...shopOrders, status: { $in: PROCUREMENT_PENDING_STATUSES } }),
      PharmacyFulfillment.countDocuments({
        ...rxOrders,
        status: { $in: [PHARMACY_RX_STATUS.RECEIVED, PHARMACY_RX_STATUS.REVIEWING] },
      }),
      MedicineRequest.countDocuments({ ...shopOrders, status: { $in: PROCUREMENT_READY_STATUSES } }),
      PharmacyFulfillment.countDocuments({ ...rxOrders, status: PHARMACY_RX_STATUS.DISPENSING }),
      MedicineRequest.countDocuments({ ...shopOrders, status: { $in: PROCUREMENT_DISPENSED_STATUSES } }),
      PharmacyFulfillment.countDocuments({
        ...rxOrders,
        status: { $in: [PHARMACY_RX_STATUS.DISPENSED, PHARMACY_RX_STATUS.PARTIALLY_DISPENSED] },
      }),
      MedicineRequest.countDocuments({ ...shopOrders, status: { $in: PROCUREMENT_INCOMING_STATUSES } }),
      PharmacyFulfillment.countDocuments(rxOrders),
      MedicineItem.countDocuments({
        ...stockBase,
        quantity: { $gt: 0 },
        $expr: { $lte: ["$quantity", { $ifNull: ["$reorderLevel", 0] }] },
      }),
      MedicineItem.countDocuments({ ...stockBase, quantity: { $lte: 0 } }),
      MedicineItem.countDocuments({ ...stockBase, expiryDate: { $gte: now, $lte: soon } }),
      MedicineRequest.find(shopOrders)
        .populate("fromFacilityId", "name type")
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      PharmacyFulfillment.find(rxOrders).populate("patientId", "name mrn").sort({ createdAt: -1 }).limit(8).lean(),
      Facility.findById(facilityId).select("name type status"),
    ]);

    const recent = [
      ...recentMedicine.map((r) => ({
        _id: r._id,
        kind: "MEDICINE_ORDER",
        status: r.status,
        createdAt: r.createdAt,
        requestNo: r.requestNo,
        fromFacility: r.fromFacilityId ? { _id: r.fromFacilityId._id, name: r.fromFacilityId.name } : null,
      })),
      ...recentRx.map((r) => ({
        _id: r._id,
        kind: "PRESCRIPTION",
        status: r.status,
        createdAt: r.createdAt,
        patientId: r.patientId,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 8);

    res.json({
      facility,
      kpis: {
        todayOrders: todayMedicineOrders + todayRxOrders,
        pendingOrders: pendingMedicine + pendingRx,
        ordersReady: readyMedicine + readyRx,
        dispensedOrders: dispensedMedicine + dispensedRx,
        lowStock,
        outOfStock,
        expiringSoon,
        prescriptionsReceived,
        procurementIncoming,
      },
      recent,
    });
  }),

  listPatientAppOrders: asyncHandler(async (req, res) => {
    const { listPharmacyPatientOrders } = await import("../services/mobileOrders.service.js");
    const orders = await listPharmacyPatientOrders(req.facilityId, req.query.bucket);
    res.json({ orders });
  }),

  patientAppOrderOne: asyncHandler(async (req, res) => {
    const { PatientMedicineOrder } = await import("../models/index.js");
    const order = await PatientMedicineOrder.findOne({ _id: req.params.id, pharmacyFacilityId: req.facilityId });
    if (!order) throw new AppError("Order not found.", 404, "NOT_FOUND");
    res.json({ order });
  }),

  advancePatientAppOrder: asyncHandler(async (req, res) => {
    const { advancePharmacyPatientOrder } = await import("../services/mobileOrders.service.js");
    const status = String(req.body.status || "").toUpperCase();
    const order = await advancePharmacyPatientOrder(req, req.facilityId, req.params.id, status, req.body.note);
    res.json({ order, message: "Order updated." });
  }),
};
