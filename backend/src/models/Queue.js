import mongoose from "mongoose";
import { APPOINTMENT_STATUS } from "../utils/constants.js";

const queueSchema = new mongoose.Schema(
  {
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true },
    doctorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", required: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    dateKey: { type: String, required: true },
    tokenNumber: { type: Number, required: true },
    status: {
      type: String,
      enum: [APPOINTMENT_STATUS.CHECKED_IN, APPOINTMENT_STATUS.WAITING, APPOINTMENT_STATUS.IN_CONSULTATION, APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.NO_SHOW],
      default: APPOINTMENT_STATUS.WAITING,
    },
    position: Number,
  },
  { timestamps: true }
);

queueSchema.index({ facilityId: 1, doctorUserId: 1, dateKey: 1, tokenNumber: 1 }, { unique: true });

export const Queue = mongoose.model("Queue", queueSchema);
