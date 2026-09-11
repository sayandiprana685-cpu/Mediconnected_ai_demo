import mongoose from "mongoose";

const patientSchema = new mongoose.Schema(
  {
    mrn: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    age: Number,
    sex: { type: String, enum: ["Female", "Male", "Other"] },
    phone: String,
    city: String,
    district: String,
    bloodGroup: String,
    allergies: [String],
    homeFacilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    dateOfBirth: Date,
    address: String,
    state: String,
    pin: String,
    country: { type: String, default: "India" },
    geo: { lat: Number, lng: Number },
    locationSource: { type: String, enum: ["GPS", "MANUAL", "UNKNOWN"], default: "UNKNOWN" },
    emergencyContactName: String,
    emergencyContactPhone: String,
    languagePreference: { type: String, default: "en" },
  },
  { timestamps: true }
);

patientSchema.index({ userId: 1 }, { unique: true, sparse: true });
patientSchema.index({ phone: 1 });

export const Patient = mongoose.model("Patient", patientSchema);
