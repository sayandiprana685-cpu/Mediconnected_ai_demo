import mongoose from "mongoose";

// The AI Health Assistant's chat thread. TriageResult already stores the
// clinical answer for one request; this stores the CONVERSATION around it, so
// a patient can scroll back through what they asked and were told.
// Mongoose pluralises this to the `aiconversations` collection.

export const AI_TRIAGE_LEVELS = ["EMERGENCY", "URGENT", "ROUTINE", "SELF_CARE", "UNKNOWN"];

const aiConversationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", index: true },
    title: { type: String, trim: true, maxlength: 120 },
    language: { type: String, default: "en", maxlength: 8 },
    lastMessageAt: { type: Date, default: Date.now },
    // The worst level seen anywhere in the thread, so a list of past
    // conversations can flag the ones that mattered.
    highestTriageLevel: { type: String, enum: AI_TRIAGE_LEVELS },
    messageCount: { type: Number, default: 0 },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

aiConversationSchema.index({ userId: 1, archived: 1, lastMessageAt: -1 });

export const AiConversation = mongoose.model("AiConversation", aiConversationSchema);
