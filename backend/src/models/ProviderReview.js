import mongoose from "mongoose";

// Ratings and reviews for a VERIFIED provider, optionally narrowed to one
// doctor at that provider. `facilityId` always points at a real Facility, so a
// review can never attach to a provider that does not exist.

export const REVIEW_CONTEXTS = ["CONSULTATION", "LAB", "PHARMACY", "HOSPITAL", "ORDER", "OTHER"];

const providerReviewSchema = new mongoose.Schema(
  {
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true, index: true },
    // Null for a whole-facility review, set for "this doctor at this facility".
    doctorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },

    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient" },

    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 120 },
    body: { type: String, trim: true, maxlength: 1000 },
    visitContext: { type: String, enum: REVIEW_CONTEXTS, default: "OTHER" },

    // Hidden reviews stay in the database for audit but drop out of every
    // patient-facing list and out of the average.
    status: { type: String, enum: ["VISIBLE", "HIDDEN"], default: "VISIBLE" },

    reply: {
      body: { type: String, trim: true, maxlength: 1000 },
      byUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      at: Date,
    },
  },
  { timestamps: true }
);

providerReviewSchema.index({ facilityId: 1, status: 1, createdAt: -1 });
providerReviewSchema.index({ facilityId: 1, doctorUserId: 1, status: 1 });
// One review per person per provider (and per doctor where named). Upserted
// rather than appended, so a second visit updates the first opinion instead of
// letting one user move a provider's average on their own.
providerReviewSchema.index(
  { userId: 1, facilityId: 1, doctorUserId: 1 },
  { unique: true }
);

export const ProviderReview = mongoose.model("ProviderReview", providerReviewSchema);
