import mongoose from "mongoose";

import { AI_TRIAGE_LEVELS } from "./AiConversation.js";

const actionSchema = new mongoose.Schema(
  {
    type: { type: String, default: "navigate" },
    // Screen names the mobile navigator understands, e.g. "Hospitals".
    screen: String,
    tool: String,
    params: mongoose.Schema.Types.Mixed,
  },
  { _id: false }
);

const predictedConditionSchema = new mongoose.Schema(
  {
    condition: String,
    confidence: Number,
  },
  { _id: false }
);

const aiMessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AiConversation",
      required: true,
      index: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // The same client-generated UUID that TriageResult keys on, so one phone
    // action can be traced from chat row to clinical row. Unique per thread
    // and role, which makes a replayed offline queue a no-op instead of a
    // duplicate.
    requestId: { type: String, trim: true, maxlength: 120 },

    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    mode: { type: String, enum: ["TEXT", "VOICE"], default: "TEXT" },
    // What the patient typed, or what the assistant said.
    content: { type: String, required: true, maxlength: 8000 },

    // VOICE only: what the transcription service heard.
    transcript: { type: String, maxlength: 8000 },
    transcriptionConfidence: Number,

    triageLevel: { type: String, enum: AI_TRIAGE_LEVELS },
    recommendedAction: { type: String, maxlength: 1000 },
    redFlags: [String],
    reasoning: [String],
    predictedConditions: [predictedConditionSchema],
    disclaimer: { type: String, maxlength: 600 },

    actions: [actionSchema],
    speak: { type: Boolean, default: false },

    // SENT = answered live. QUEUED = the phone stored it offline and pushed it
    // on reconnect. FAILED = the AI service could not answer; the disclaimer
    // and a safe holding message are still shown, never a fake all-clear.
    status: { type: String, enum: ["SENT", "QUEUED", "FAILED"], default: "SENT" },
    degraded: { type: Boolean, default: false },
    clientCreatedAt: Date,
  },
  { timestamps: true }
);

aiMessageSchema.index({ conversationId: 1, createdAt: 1 });
// Unique per thread + requestId + role, NOT per thread + requestId: one turn
// writes a user row and an assistant row that share the same requestId, so
// leaving role out would reject the second half of every turn.
aiMessageSchema.index(
  { conversationId: 1, requestId: 1, role: 1 },
  { unique: true, partialFilterExpression: { requestId: { $type: "string" } } }
);

export const AiMessage = mongoose.model("AiMessage", aiMessageSchema);
