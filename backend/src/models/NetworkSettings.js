import mongoose from "mongoose";

const networkSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    name: { type: String, required: true, trim: true, maxlength: 120, default: "Maharashtra provider network" },
  },
  { timestamps: true }
);

export const NetworkSettings = mongoose.model("NetworkSettings", networkSettingsSchema);

export async function getNetworkSettings() {
  let doc = await NetworkSettings.findOne({ key: "default" });
  if (!doc) {
    doc = await NetworkSettings.create({ key: "default", name: "Maharashtra provider network" });
  }
  return doc;
}
