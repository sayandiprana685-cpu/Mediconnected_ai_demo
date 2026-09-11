import mongoose from "mongoose";
import { ROLES, USER_STATUS } from "../utils/constants.js";

const notificationPrefsSchema = new mongoose.Schema(
  {
    appointments: { type: Boolean, default: true },
    referrals: { type: Boolean, default: true },
    followUps: { type: Boolean, default: true },
    system: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    inApp: { type: Boolean, default: true },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    photoUrl: { type: String, trim: true },
    passwordHash: { type: String },
    role: { type: String, enum: Object.values(ROLES), required: true },
    status: { type: String, enum: Object.values(USER_STATUS), default: USER_STATUS.PENDING },
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility" },
    preferredLanguage: { type: String, default: "en" },
    timezone: { type: String, default: "Asia/Kolkata" },
    dateFormat: { type: String, enum: ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"], default: "DD/MM/YYYY" },
    timeFormat: { type: String, enum: ["12h", "24h"], default: "12h" },
    notificationPrefs: { type: notificationPrefsSchema, default: () => ({}) },
    failedLogins: { type: Number, default: 0 },
    lockUntil: { type: Date },
    lastLoginAt: { type: Date },
    refreshTokenHash: { type: String },
    passwordResetHash: { type: String },
    passwordResetExpires: { type: Date },
    pendingEmail: { type: String, lowercase: true, trim: true },
  },
  { timestamps: true }
);

userSchema.index({ phone: 1 });
userSchema.index({ role: 1, facilityId: 1 });

export const User = mongoose.model("User", userSchema);
