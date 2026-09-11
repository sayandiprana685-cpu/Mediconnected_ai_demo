import mongoose from "mongoose";

const consultationSchema = new mongoose.Schema(
  {
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true },
    doctorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment" },
    chiefComplaint: String,
    history: String,
    examination: String,
    assessment: String,
    plan: String,
    vitals: {
      bp: String,
      pulse: String,
      temp: String,
      spo2: String,
    },
    status: { type: String, enum: ["IN_PROGRESS", "COMPLETED"], default: "IN_PROGRESS" },
    startedAt: { type: Date, default: Date.now },
    completedAt: Date,
  },
  { timestamps: true }
);

consultationSchema.index({ patientId: 1, createdAt: -1 });
consultationSchema.index({ doctorUserId: 1, facilityId: 1, createdAt: -1 });

export const Consultation = mongoose.model("Consultation", consultationSchema);
