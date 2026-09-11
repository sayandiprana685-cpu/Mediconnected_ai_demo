import mongoose from "mongoose";
import { REFERRAL_STATUS } from "../utils/constants.js";

const referralSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    fromFacilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true },
    fromDoctorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    toFacilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true },
    toDoctorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reason: { type: String, required: true },
    specialty: String,
    priority: { type: String, enum: ["ROUTINE", "URGENT", "EMERGENCY"], default: "ROUTINE" },
    status: { type: String, enum: Object.values(REFERRAL_STATUS), default: REFERRAL_STATUS.CREATED },
    timeline: [
      {
        status: String,
        at: { type: Date, default: Date.now },
        note: String,
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment" },
  },
  { timestamps: true }
);

referralSchema.index({ fromFacilityId: 1, status: 1 });
referralSchema.index({ toFacilityId: 1, status: 1 });

export const Referral = mongoose.model("Referral", referralSchema);
