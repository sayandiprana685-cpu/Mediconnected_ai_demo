import mongoose from "mongoose";

const serviceSchema = new mongoose.Schema(
  {
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true },
    name: { type: String, required: true },
    category: { type: String, enum: ["CONSULTATION", "DIAGNOSTIC", "PHARMACY", "EMERGENCY", "INPATIENT", "OTHER"], default: "OTHER" },
    available: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Service = mongoose.model("Service", serviceSchema);
