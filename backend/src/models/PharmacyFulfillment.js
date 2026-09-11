import mongoose from "mongoose";
import { PHARMACY_RX_STATUS } from "../utils/constants.js";

const lineSchema = new mongoose.Schema(
  {
    prescribedName: String,
    prescribedQty: Number,
    dispensedQty: { type: Number, default: 0 },
    inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: "MedicineItem" },
    batchNumber: String,
    unit: String,
  },
  { _id: false }
);

const historySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    at: { type: Date, default: Date.now },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility" },
    note: String,
  },
  { _id: false }
);

const pharmacyFulfillmentSchema = new mongoose.Schema(
  {
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true, index: true },
    prescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "Prescription", required: true },
    sourceFacilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility" },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    doctorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: Object.values(PHARMACY_RX_STATUS), default: PHARMACY_RX_STATUS.RECEIVED },
    lines: [lineSchema],
    dispensedAt: Date,
    dispensedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    rejectionReason: String,
    history: [historySchema],
  },
  { timestamps: true }
);

pharmacyFulfillmentSchema.index({ facilityId: 1, createdAt: -1 });
pharmacyFulfillmentSchema.index({ prescriptionId: 1, facilityId: 1 }, { unique: true });

export const PharmacyFulfillment = mongoose.model("PharmacyFulfillment", pharmacyFulfillmentSchema);
