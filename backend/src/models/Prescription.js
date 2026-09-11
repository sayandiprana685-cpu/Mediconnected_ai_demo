import mongoose from "mongoose";
import { PRESCRIPTION_STATUS } from "../utils/constants.js";

const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    strength: { type: String, default: "" },
    dosage: { type: String, default: "" },
    frequency: { type: String, default: "" },
    duration: { type: String, default: "" },
    instructions: { type: String, default: "" },
  },
  { _id: false }
);

const investigationSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    advised: { type: Boolean, default: true },
  },
  { _id: false }
);

const prescriptionSchema = new mongoose.Schema(
  {
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true },
    doctorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    consultationId: { type: mongoose.Schema.Types.ObjectId, ref: "Consultation" },
    status: {
      type: String,
      enum: Object.values(PRESCRIPTION_STATUS),
      default: PRESCRIPTION_STATUS.DRAFT,
    },
    revisionOf: { type: mongoose.Schema.Types.ObjectId, ref: "Prescription" },
    revisionNumber: { type: Number, default: 1 },
    letterhead: {
      facilityName: String,
      department: String,
      address: String,
      city: String,
      state: String,
      pin: String,
      phone: String,
      email: String,
      website: String,
    },
    doctorSnapshot: {
      name: String,
      qualification: String,
      registrationNumber: String,
      specialization: String,
      signatureUrl: String,
    },
    patientSnapshot: {
      name: String,
      mrn: String,
      age: String,
      sex: String,
      address: String,
      date: String,
    },
    vitals: {
      bp: String,
      temperature: String,
      pulse: String,
      weight: String,
    },
    chiefComplaint: String,
    diagnosis: String,
    clinicalNotes: String,
    medicines: [medicineSchema],
    investigations: [investigationSchema],
    adviceItems: [String],
    followUpDate: Date,
    substitutionAllowed: { type: Boolean, default: null },
    finalizedAt: Date,
    issuedAt: Date,
    items: [
      {
        medicine: String,
        dose: String,
        frequency: String,
        duration: String,
        instructions: String,
      },
    ],
    advice: String,
  },
  { timestamps: true }
);

prescriptionSchema.index({ facilityId: 1, createdAt: -1 });
prescriptionSchema.index({ doctorUserId: 1, facilityId: 1, createdAt: -1 });
prescriptionSchema.index({ patientId: 1, createdAt: -1 });

export const Prescription = mongoose.model("Prescription", prescriptionSchema);
