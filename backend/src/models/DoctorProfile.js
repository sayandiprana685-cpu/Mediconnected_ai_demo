import mongoose from "mongoose";
import { DOCTOR_AVAILABILITY } from "../utils/constants.js";

const doctorProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    photoUrl: String,
    signatureUrl: String,
    registrationNumber: { type: String, required: true, unique: true },
    specialization: { type: String, required: true },
    qualification: { type: String, required: true },
    experienceYears: { type: Number, default: 0 },
    languages: [{ type: String }],
    teleconsultationAvailable: { type: Boolean, default: false },
    credentialsVerified: { type: Boolean, default: false },
    verifiedAt: Date,
    availability: { type: String, enum: Object.values(DOCTOR_AVAILABILITY), default: DOCTOR_AVAILABILITY.OFFLINE },
  },
  { timestamps: true }
);

export const DoctorProfile = mongoose.model("DoctorProfile", doctorProfileSchema);
