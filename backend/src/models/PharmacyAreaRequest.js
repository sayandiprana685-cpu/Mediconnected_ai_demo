import mongoose from "mongoose";

const pharmacyAreaRequestSchema = new mongoose.Schema(
  {
    fromFacilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    city: String,
    district: String,
    state: String,
    pin: String,
    notes: { type: String, maxlength: 500 },
    status: { type: String, enum: ["OPEN", "CLOSED"], default: "OPEN" },
  },
  { timestamps: true }
);

export const PharmacyAreaRequest = mongoose.model("PharmacyAreaRequest", pharmacyAreaRequestSchema);
