import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema(
  {
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true },
    name: { type: String, required: true },
    description: String,
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

departmentSchema.index({ facilityId: 1, name: 1 }, { unique: true });

export const Department = mongoose.model("Department", departmentSchema);
