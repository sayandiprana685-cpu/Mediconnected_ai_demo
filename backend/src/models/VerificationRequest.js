import mongoose from "mongoose";
import { FACILITY_STATUS } from "../utils/constants.js";

const verificationRequestSchema = new mongoose.Schema(
  {
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: Object.values(FACILITY_STATUS), default: FACILITY_STATUS.UNDER_REVIEW },
    notes: String,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
  },
  { timestamps: true }
);

export const VerificationRequest = mongoose.model("VerificationRequest", verificationRequestSchema);
