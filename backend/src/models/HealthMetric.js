import mongoose from "mongoose";

// Patient-entered vitals for the Health Metrics screen. The rest of this
// schema stores clinical facts written BY a provider; this one is written by
// the patient on their own phone, so it is kept separate and never merged
// into a clinical record without a professional reviewing it.

export const HEALTH_METRIC_KINDS = [
  "BLOOD_PRESSURE",
  "BLOOD_SUGAR",
  "WEIGHT",
  "STEPS",
  "HEART_RATE",
  "SPO2",
  "TEMPERATURE",
  "OTHER",
];

const healthMetricSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Optional: a reading taken for a family member rather than the account holder.
    familyMemberId: { type: mongoose.Schema.Types.ObjectId, ref: "FamilyMember" },

    kind: { type: String, enum: HEALTH_METRIC_KINDS, required: true },
    // For BLOOD_PRESSURE, `value` is systolic and `valueSecondary` is diastolic.
    value: { type: Number, required: true },
    valueSecondary: Number,
    unit: { type: String, trim: true },

    measuredAt: { type: Date, default: Date.now, index: true },
    source: { type: String, enum: ["MANUAL", "DEVICE", "LAB"], default: "MANUAL" },
    note: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

healthMetricSchema.index({ patientId: 1, kind: 1, measuredAt: -1 });
healthMetricSchema.index({ userId: 1, measuredAt: -1 });

export const HealthMetric = mongoose.model("HealthMetric", healthMetricSchema);
