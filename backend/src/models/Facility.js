import mongoose from "mongoose";
import { FACILITY_STATUS, FACILITY_TYPES } from "../utils/constants.js";

const hoursSchema = new mongoose.Schema(
  {
    day: { type: Number, min: 0, max: 6 },
    open: String,
    close: String,
    closed: { type: Boolean, default: false },
  },
  { _id: false }
);

const facilitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: Object.values(FACILITY_TYPES), required: true },
    status: { type: String, enum: Object.values(FACILITY_STATUS), default: FACILITY_STATUS.PENDING_VERIFICATION },
    address: { type: String, required: true },
    city: { type: String, required: true },
    district: { type: String, required: true },
    state: { type: String, required: true, default: "Maharashtra" },
    pin: { type: String, required: true },
    geo: {
      lat: Number,
      lng: Number,
    },
    contactNumber: { type: String, required: true },
    officialEmail: { type: String, required: true, lowercase: true },
    legalName: { type: String, trim: true },
    licenceNumber: { type: String, required: true },
    licenceAuthority: String,
    licenceIssuedAt: Date,
    licenceExpiresAt: Date,
    accreditation: { type: String, trim: true },
    adminDesignation: { type: String, trim: true },
    responsibleProfessional: {
      name: { type: String, trim: true },
      designation: { type: String, trim: true },
      registrationNumber: { type: String, trim: true },
      phone: { type: String, trim: true },
    },
    emergencyAvailable: { type: Boolean, default: false },
    consultationAvailable: { type: Boolean, default: true },
    diagnosticAvailable: { type: Boolean, default: false },
    medicineAvailable: { type: Boolean, default: false },
    operatingHours: [hoursSchema],
    documents: [{ name: String, url: String, kind: String }],
    rejectionReason: String,
    verifiedAt: Date,
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    occupancyHint: { type: Number, default: 0 },
    deliveryAvailable: { type: Boolean, default: false },
    pickupAvailable: { type: Boolean, default: true },
    website: String,
    logoUrl: String,
    description: String,
    country: { type: String, default: "India" },
    timezone: { type: String, default: "Asia/Kolkata" },
    dateFormat: { type: String, enum: ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"], default: "DD/MM/YYYY" },
    appointmentSlotMinutes: { type: Number, default: 15, min: 5, max: 120 },
    notificationPrefs: {
      appointments: { type: Boolean, default: true },
      referrals: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

facilitySchema.index({ district: 1, status: 1 });
facilitySchema.index({ city: 1, status: 1 });
facilitySchema.index({ type: 1, status: 1 });
facilitySchema.index({ "geo.lat": 1, "geo.lng": 1 });
facilitySchema.index({ name: "text" });
facilitySchema.index({ updatedAt: 1, district: 1, status: 1 });

export const Facility = mongoose.model("Facility", facilitySchema);
