import mongoose from "mongoose";
import { APPOINTMENT_STATUS } from "../utils/constants.js";

const appointmentSchema = new mongoose.Schema(
  {
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true },
    doctorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
    scheduledAt: { type: Date, required: true },
    durationMinutes: { type: Number, default: 15 },
    reason: String,
    status: { type: String, enum: Object.values(APPOINTMENT_STATUS), default: APPOINTMENT_STATUS.BOOKED },
    tokenNumber: Number,
    notes: String,
    completedAt: Date,
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

appointmentSchema.index({ facilityId: 1, scheduledAt: 1, status: 1 });
appointmentSchema.index({ doctorUserId: 1, scheduledAt: 1, status: 1 });
appointmentSchema.index({ patientId: 1 });

export const Appointment = mongoose.model("Appointment", appointmentSchema);
