import mongoose from "mongoose";
import { PATIENT_ORDER_STATUS } from "../utils/constants.js";

const itemSchema = new mongoose.Schema(
  {
    medicineItemId: { type: mongoose.Schema.Types.ObjectId, ref: "MedicineItem" },
    name: { type: String, required: true },
    genericName: String,
    strength: String,
    dosageForm: String,
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: Number,
    prescriptionRequired: { type: Boolean, default: false },
  },
  { _id: false }
);

const historySchema = new mongoose.Schema(
  {
    status: String,
    at: { type: Date, default: Date.now },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: String,
  },
  { _id: false }
);

const patientMedicineOrderSchema = new mongoose.Schema(
  {
    orderNo: { type: String, required: true, unique: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    pharmacyFacilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true, index: true },
    prescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "Prescription" },
    status: {
      type: String,
      enum: Object.values(PATIENT_ORDER_STATUS),
      default: PATIENT_ORDER_STATUS.PENDING,
      index: true,
    },
    fulfillment: { type: String, enum: ["DELIVERY", "PICKUP"], default: "PICKUP" },
    items: { type: [itemSchema], required: true },
    notes: { type: String, maxlength: 500 },
    deliveryAddress: String,
    rejectionReason: String,
    history: [historySchema],
  },
  { timestamps: true }
);

patientMedicineOrderSchema.index({ userId: 1, createdAt: -1 });
patientMedicineOrderSchema.index({ pharmacyFacilityId: 1, createdAt: -1 });

export const PatientMedicineOrder = mongoose.model("PatientMedicineOrder", patientMedicineOrderSchema);
