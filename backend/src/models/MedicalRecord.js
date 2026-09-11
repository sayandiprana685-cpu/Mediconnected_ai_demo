import mongoose from "mongoose";

const medicalRecordSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true },
    authorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: ["NOTE", "SUMMARY", "ALLERGY", "CONDITION"], default: "NOTE" },
    title: String,
    body: String,
    consultationId: { type: mongoose.Schema.Types.ObjectId, ref: "Consultation" },
  },
  { timestamps: true }
);

medicalRecordSchema.index({ patientId: 1, createdAt: -1 });

export const MedicalRecord = mongoose.model("MedicalRecord", medicalRecordSchema);
