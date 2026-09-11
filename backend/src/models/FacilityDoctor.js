import mongoose from "mongoose";

const facilityDoctorSchema = new mongoose.Schema(
  {
    doctorProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "DoctorProfile", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
    status: { type: String, enum: ["PENDING", "ACTIVE", "INACTIVE"], default: "PENDING" },
    todayActive: { type: Boolean, default: undefined },
    todayActiveOn: { type: String },
    consultationSchedule: {
      days: [{ type: Number }],
      start: String,
      end: String,
      durationMinutes: { type: Number, default: 15 },
    },
  },
  { timestamps: true }
);

facilityDoctorSchema.index({ doctorProfileId: 1, facilityId: 1 }, { unique: true });
facilityDoctorSchema.index({ facilityId: 1, status: 1 });
facilityDoctorSchema.index({ userId: 1, status: 1 });

export const FacilityDoctor = mongoose.model("FacilityDoctor", facilityDoctorSchema);
