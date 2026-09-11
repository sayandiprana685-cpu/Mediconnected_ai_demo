import mongoose from "mongoose";

// One row per risk calculation. Scores are recalculated whenever new patient
// data syncs in (the nightly cron, or an immediate re-score after a home-visit
// form is uploaded), so history is kept rather than overwritten: a health
// worker needs to see that a patient moved from LOW to HIGH, not just that
// they are HIGH today.

const riskReasonSchema = new mongoose.Schema(
  {
    code: String,
    label: String,
    points: Number,
    severity: { type: String, enum: ["LOW", "MEDIUM", "HIGH"] },
    evidence: String,
  },
  { _id: false }
);

const riskScoreSchema = new mongoose.Schema(
  {
    requestId: { type: String, required: true, trim: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility" },

    domain: {
      type: String,
      enum: ["MATERNAL", "CHILD", "CHRONIC"],
      required: true,
    },

    result: {
      riskLevel: { type: String, enum: ["LOW", "MEDIUM", "HIGH"], required: true },
      riskScore: { type: Number, min: 0, max: 100 },
      followUpPriority: { type: Number, min: 1, max: 5 },
      // The specific reasons are the whole point of a rule-based score: a health
      // worker must be able to see WHY this patient was flagged.
      reasons: [riskReasonSchema],
      recommendedActions: [String],
      followUpIntervalDays: Number,
      escalateToFacility: { type: Boolean, default: false },
      dataQuality: {
        completeness: Number,
        missingFields: [String],
        note: String,
      },
      rulesVersion: String,
      disclaimer: String,
    },

    // The exact payload that produced this score, so a rule change can be
    // validated by replaying stored inputs against the new engine.
    input: { type: mongoose.Schema.Types.Mixed },

    /**
     * API   - requested on demand by a health worker's screen.
     * CRON  - the scheduled recalculation triggered from this backend.
     * SYNC  - recomputed because a device pushed new patient data.
     */
    scoredBy: { type: String, enum: ["API", "CRON", "SYNC"], default: "API" },

    status: { type: String, enum: ["OK", "FALLBACK", "QUEUED"], default: "OK" },
    triggeredBy: String,
  },
  { timestamps: true }
);

// Idempotency is scoped per domain so the same batch job can score one patient
// in all three domains without the requestId colliding with itself.
riskScoreSchema.index({ requestId: 1, domain: 1 }, { unique: true });
riskScoreSchema.index({ patientId: 1, domain: 1, createdAt: -1 });
// The work-list query: every HIGH-risk patient in a facility, newest first.
riskScoreSchema.index({ facilityId: 1, "result.riskLevel": 1, createdAt: -1 });

export const RiskScore = mongoose.model("RiskScore", riskScoreSchema);
