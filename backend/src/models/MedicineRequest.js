import mongoose from "mongoose";
import { PROCUREMENT_STATUS } from "../utils/constants.js";

const itemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    genericName: String,
    brandName: String,
    strength: String,
    dosageForm: String,
    notes: String,
    requestedQty: { type: Number, required: true, min: 1 },
    offeredQty: Number,
    availableQty: Number,
    unitPrice: Number,
    subtotal: Number,
    prescriptionRequired: { type: Boolean, default: false },
    authRequired: { type: Boolean, default: false },
  },
  { _id: false }
);

const historySchema = new mongoose.Schema(
  {
    status: String,
    at: { type: Date, default: Date.now },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility" },
    note: String,
  },
  { _id: false }
);

const medicineRequestSchema = new mongoose.Schema(
  {
    requestNo: { type: String, required: true, unique: true },
    requestGroupId: { type: String, required: true, index: true },
    fromFacilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true, index: true },
    pharmacyFacilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: Object.values(PROCUREMENT_STATUS), default: PROCUREMENT_STATUS.PENDING, index: true },
    urgency: { type: String, enum: ["NORMAL", "URGENT"], default: "NORMAL" },
    notes: { type: String, maxlength: 500 },
    items: { type: [itemSchema], required: true },
    fulfillment: { type: String, enum: ["DELIVERY", "PICKUP"] },
    paymentStatus: { type: String, enum: ["NOT_REQUIRED", "UNPAID", "QUOTED"], default: "NOT_REQUIRED" },
    stockReserved: { type: Boolean, default: false },
    deliveryCharge: { type: Number, min: 0, default: 0 },
    medicinesTotal: Number,
    grandTotal: Number,
    quoteSubmitted: { type: Boolean, default: false },
    quoteAcceptedAt: Date,
    rejectionReason: String,
    expiresAt: Date,
    history: [historySchema],
  },
  { timestamps: true }
);

medicineRequestSchema.index({ fromFacilityId: 1, createdAt: -1 });
medicineRequestSchema.index({ pharmacyFacilityId: 1, createdAt: -1 });

export const MedicineRequest = mongoose.model("MedicineRequest", medicineRequestSchema);
