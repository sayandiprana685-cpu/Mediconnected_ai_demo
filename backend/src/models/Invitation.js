import mongoose from "mongoose";
import { INVITE_STATUS } from "../utils/constants.js";

const invitationSchema = new mongoose.Schema(
  {
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    email: { type: String, required: true, lowercase: true },
    phone: String,
    name: { type: String, required: true },
    registrationNumber: { type: String, required: true },
    specialization: { type: String, required: true },
    qualification: { type: String, required: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
    experienceYears: Number,
    consultationSchedule: {
      days: [{ type: Number }],
      start: String,
      end: String,
      durationMinutes: Number,
    },
    tokenHash: { type: String, required: true, unique: true },
    status: { type: String, enum: Object.values(INVITE_STATUS), default: INVITE_STATUS.SENT },
    expiresAt: { type: Date, required: true },
    acceptedAt: Date,
    openedAt: Date,
    existingUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

invitationSchema.index({ email: 1, facilityId: 1 });
invitationSchema.index({ expiresAt: 1 });

export const Invitation = mongoose.model("Invitation", invitationSchema);
