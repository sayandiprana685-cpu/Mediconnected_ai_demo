import mongoose from "mongoose";

const followUpSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true },
    doctorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    dueAt: { type: Date, required: true },
    reason: String,
    status: { type: String, enum: ["PENDING", "SCHEDULED", "COMPLETED", "MISSED"], default: "PENDING" },
    consultationId: { type: mongoose.Schema.Types.ObjectId, ref: "Consultation" },
  },
  { timestamps: true }
);

export const FollowUp = mongoose.model("FollowUp", followUpSchema);
