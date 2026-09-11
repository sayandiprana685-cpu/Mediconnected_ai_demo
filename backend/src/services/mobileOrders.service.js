import { Facility, MedicineItem, PatientMedicineOrder, User } from "../models/index.js";
import { AppError } from "../utils/errors.js";
import { FACILITY_STATUS, FACILITY_TYPES, PATIENT_ORDER_STATUS, PATIENT_ORDER_TRANSITIONS } from "../utils/constants.js";
import { notifyFacilityUsers, notifyUser } from "./notify.service.js";
import { publicFacility } from "../utils/geo.js";

function orderNo() {
  return `PO-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 999)
    .toString()
    .padStart(3, "0")}`;
}

export async function createPatientOrder({ user, patient, body }) {
  const pharmacy = await Facility.findById(body.pharmacyFacilityId);
  if (!pharmacy || pharmacy.status !== FACILITY_STATUS.VERIFIED) {
    throw new AppError("This pharmacy is not available.", 404, "NOT_FOUND");
  }
  if (![FACILITY_TYPES.PHARMACY, FACILITY_TYPES.MEDICINE_SHOP].includes(pharmacy.type)) {
    throw new AppError("Orders can only be sent to a pharmacy or medicine shop.", 422, "WRONG_PROVIDER_TYPE");
  }
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw new AppError("Add at least one medicine.", 422, "ITEMS_REQUIRED");
  const normalized = [];
  for (const it of items) {
    const qty = Math.max(1, Number(it.quantity || 1));
    let name = String(it.name || "").trim();
    let row = {
      name,
      quantity: qty,
      genericName: it.genericName,
      strength: it.strength,
      dosageForm: it.dosageForm,
      prescriptionRequired: !!it.prescriptionRequired,
    };
    if (it.medicineItemId) {
      const med = await MedicineItem.findOne({ _id: it.medicineItemId, facilityId: pharmacy._id });
      if (!med) throw new AppError("A selected medicine is not sold at this pharmacy.", 422, "MEDICINE_MISMATCH");
      row = {
        medicineItemId: med._id,
        name: med.name,
        genericName: med.genericName,
        strength: med.strength,
        dosageForm: med.dosageForm,
        quantity: qty,
        unitPrice: med.unitPrice,
        prescriptionRequired: med.prescriptionRequired,
      };
    }
    if (!row.name) throw new AppError("Each item needs a medicine name.", 422, "NAME_INVALID");
    normalized.push(row);
  }
  const fulfillment = body.fulfillment === "DELIVERY" ? "DELIVERY" : "PICKUP";
  if (fulfillment === "DELIVERY" && !pharmacy.deliveryAvailable) {
    throw new AppError("This pharmacy does not offer delivery.", 422, "NO_DELIVERY");
  }
  if (fulfillment === "PICKUP" && pharmacy.pickupAvailable === false) {
    throw new AppError("This pharmacy does not offer pickup.", 422, "NO_PICKUP");
  }
  const order = await PatientMedicineOrder.create({
    orderNo: orderNo(),
    patientId: patient._id,
    userId: user._id,
    pharmacyFacilityId: pharmacy._id,
    prescriptionId: body.prescriptionId || undefined,
    status: PATIENT_ORDER_STATUS.PENDING,
    fulfillment,
    items: normalized,
    notes: String(body.notes || "").slice(0, 500),
    deliveryAddress: fulfillment === "DELIVERY" ? String(body.deliveryAddress || patient.address || "") : "",
    history: [{ status: PATIENT_ORDER_STATUS.PENDING, actorId: user._id, note: "Order placed from the user app." }],
  });
  await notifyFacilityUsers(pharmacy._id, {
    title: "New patient medicine order",
    body: `${patient.name} placed order ${order.orderNo}.`,
    kind: "ORDER",
    channel: "system",
  });
  return serializeOrder(order, pharmacy);
}

export async function listPatientOrders(userId) {
  const rows = await PatientMedicineOrder.find({ userId }).sort({ createdAt: -1 }).limit(80);
  const facIds = rows.map((r) => r.pharmacyFacilityId);
  const facilities = await Facility.find({ _id: { $in: facIds } }).select(
    "name type city district contactNumber deliveryAvailable pickupAvailable"
  );
  const map = Object.fromEntries(facilities.map((f) => [String(f._id), f]));
  return rows.map((r) => serializeOrder(r, map[String(r.pharmacyFacilityId)]));
}

export async function getPatientOrder(userId, id) {
  const row = await PatientMedicineOrder.findOne({ _id: id, userId });
  if (!row) throw new AppError("Order not found.", 404, "NOT_FOUND");
  const pharmacy = await Facility.findById(row.pharmacyFacilityId);
  return serializeOrder(row, pharmacy);
}

export async function cancelPatientOrder(userId, id) {
  const row = await PatientMedicineOrder.findOne({ _id: id, userId });
  if (!row) throw new AppError("Order not found.", 404, "NOT_FOUND");
  const cancellable = ["PENDING", "REQUESTED", "PHARMACY_REVIEWING"];
  if (!cancellable.includes(row.status)) {
    throw new AppError("This order can no longer be cancelled.", 409, "NOT_CANCELLABLE");
  }
  row.status = PATIENT_ORDER_STATUS.CANCELLED;
  row.history.push({ status: PATIENT_ORDER_STATUS.CANCELLED, actorId: userId, note: "Cancelled by patient." });
  await row.save();
  return serializeOrder(row, await Facility.findById(row.pharmacyFacilityId));
}

export async function listPharmacyPatientOrders(facilityId, bucket) {
  const filter = { pharmacyFacilityId: facilityId };
  if (bucket === "INCOMING") filter.status = { $in: ["PENDING", "REQUESTED", "PHARMACY_REVIEWING"] };
  if (bucket === "ACTIVE") {
    filter.status = { $in: ["ACCEPTED", "PARTIALLY_AVAILABLE", "ORDER_CONFIRMED", "PREPARING", "READY", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY"] };
  }
  if (bucket === "COMPLETED") filter.status = { $in: ["DELIVERED", "COLLECTED", "COMPLETED"] };
  const rows = await PatientMedicineOrder.find(filter).sort({ createdAt: -1 }).limit(100);
  return rows;
}

export async function advancePharmacyPatientOrder(req, facilityId, id, nextStatus, note) {
  const row = await PatientMedicineOrder.findOne({ _id: id, pharmacyFacilityId: facilityId });
  if (!row) throw new AppError("Order not found.", 404, "NOT_FOUND");
  const allowed = PATIENT_ORDER_TRANSITIONS[row.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw new AppError("This status change is not allowed.", 409, "INVALID_TRANSITION");
  }
  row.status = nextStatus;
  row.history.push({ status: nextStatus, actorId: req.user._id, note: note || "" });
  await row.save();
  await notifyUser(row.userId, {
    title: "Medicine order update",
    body: `Order ${row.orderNo} is now ${nextStatus.replace(/_/g, " ").toLowerCase()}.`,
    kind: "ORDER",
    channel: "system",
  });
  return row;
}

function serializeOrder(row, pharmacy) {
  const o = row.toObject ? row.toObject() : row;
  return {
    id: String(o._id),
    orderNo: o.orderNo,
    status: o.status,
    fulfillment: o.fulfillment,
    items: o.items,
    notes: o.notes,
    deliveryAddress: o.deliveryAddress,
    rejectionReason: o.rejectionReason,
    history: o.history || [],
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    pharmacy: pharmacy
      ? {
          id: String(pharmacy._id),
          name: pharmacy.name,
          city: pharmacy.city,
          district: pharmacy.district,
          contactNumber: pharmacy.contactNumber,
          type: pharmacy.type,
          deliveryAvailable: pharmacy.deliveryAvailable,
          pickupAvailable: pharmacy.pickupAvailable,
        }
      : publicFacility(pharmacy),
  };
}

export { User };
