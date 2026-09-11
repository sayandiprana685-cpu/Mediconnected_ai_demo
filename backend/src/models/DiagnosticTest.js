import mongoose from "mongoose";

const diagnosticTestSchema = new mongoose.Schema(
  {
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true },
    category: { type: String, trim: true, default: "GENERAL" },
    sampleType: { type: String, trim: true },
    preparation: { type: String, trim: true },
    turnaroundMinutes: { type: Number, min: 0 },
    homeCollection: { type: Boolean, default: false },
    available: { type: Boolean, default: true },
    price: { type: Number, min: 0 },
    referenceRange: { type: String, trim: true },
    units: { type: String, trim: true },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
  },
  { timestamps: true }
);

diagnosticTestSchema.index({ facilityId: 1, name: 1 });

export const DiagnosticTest = mongoose.model("DiagnosticTest", diagnosticTestSchema);
