import mongoose from "mongoose";

// Medicine reminder / schedule. The server is the source of truth for WHAT to
// take and WHEN; firing the alert on time is the phone's job, because a
// reminder that only works while the app is open is not a reminder.
// `deviceNotificationId` is the hand-off point for a native scheduler.

const medicineReminderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", index: true },
    familyMemberId: { type: mongoose.Schema.Types.ObjectId, ref: "FamilyMember" },

    medicineName: { type: String, required: true, trim: true, maxlength: 160 },
    dosage: { type: String, trim: true, maxlength: 80 },
    // "after food", "with water", "before bed" - plain words the patient reads.
    instructions: { type: String, trim: true, maxlength: 200 },

    // 24-hour local clock times, e.g. ["08:00","14:00","20:00"].
    times: {
      type: [String],
      required: true,
      validate: {
        validator: (v) => v.length > 0 && v.every((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t))),
        message: "Each time must be in HH:MM 24-hour format.",
      },
    },
    // 0 = Sunday .. 6 = Saturday. Empty means every day.
    days: {
      type: [Number],
      default: [],
      validate: {
        validator: (v) => v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
        message: "Days must be integers from 0 (Sunday) to 6 (Saturday).",
      },
    },

    startDate: { type: Date, default: Date.now },
    endDate: Date,
    // Links the reminder back to the prescription it came from, so
    // "order these medicines again" can pre-fill a cart.
    prescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "Prescription" },

    active: { type: Boolean, default: true },
    lastNotifiedAt: Date,
    snoozedUntil: Date,
    deviceNotificationId: { type: String, trim: true, maxlength: 120 },
  },
  { timestamps: true }
);

medicineReminderSchema.index({ userId: 1, active: 1 });
medicineReminderSchema.index({ patientId: 1, active: 1 });

export const MedicineReminder = mongoose.model("MedicineReminder", medicineReminderSchema);
