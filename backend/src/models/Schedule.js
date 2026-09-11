import mongoose from "mongoose";

const blockSchema = new mongoose.Schema(
  {
    days: [{ type: Number, min: 0, max: 6 }],
    date: String,
    start: { type: String, required: true },
    end: { type: String, required: true },
    breakStart: String,
    breakEnd: String,
    durationMinutes: { type: Number, default: 15 },
    online: { type: Boolean, default: false },
  },
  { _id: false }
);

const scheduleSchema = new mongoose.Schema(
  {
    doctorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true },
    blocks: [blockSchema],
    unavailableDates: [Date],
  },
  { timestamps: true }
);

scheduleSchema.index({ doctorUserId: 1, facilityId: 1 }, { unique: true });

export const Schedule = mongoose.model("Schedule", scheduleSchema);
