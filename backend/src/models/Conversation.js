import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    patientUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    providerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true, index: true },
    lastMessageAt: Date,
    lastPreview: String,
  },
  { timestamps: true }
);

conversationSchema.index({ patientUserId: 1, facilityId: 1 }, { unique: true });

export const Conversation = mongoose.model("Conversation", conversationSchema);
