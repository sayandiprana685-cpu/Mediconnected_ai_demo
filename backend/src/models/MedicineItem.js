import mongoose from "mongoose";
import { MEDICINE_STATUS } from "../utils/constants.js";

const medicineItemSchema = new mongoose.Schema(
  {
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true, index: true },
    name: { type: String, required: true, trim: true },
    genericName: { type: String, trim: true },
    brandName: { type: String, trim: true },
    strength: { type: String, trim: true },
    dosageForm: { type: String, trim: true },
    manufacturer: { type: String, trim: true },
    batchNumber: { type: String, trim: true },
    expiryDate: Date,
    quantity: { type: Number, default: 0, min: 0 },
    reorderLevel: { type: Number, default: 10, min: 0 },
    unitPrice: { type: Number, min: 0 },
    prescriptionRequired: { type: Boolean, default: true },
    status: { type: String, enum: Object.values(MEDICINE_STATUS), default: MEDICINE_STATUS.ACTIVE },
  },
  { timestamps: true }
);

medicineItemSchema.index({ facilityId: 1, name: 1 });
medicineItemSchema.index({ facilityId: 1, status: 1 });

export const MedicineItem = mongoose.model("MedicineItem", medicineItemSchema);
