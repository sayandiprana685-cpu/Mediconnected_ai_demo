import mongoose from "mongoose";

const healthTipSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, maxlength: 80 },
    body: { type: String, required: true, maxlength: 280 },
    locale: { type: String, default: "en" },
    active: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const HealthTip = mongoose.model("HealthTip", healthTipSchema);
