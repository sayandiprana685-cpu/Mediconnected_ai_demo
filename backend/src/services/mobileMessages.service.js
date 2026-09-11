import {
  ChatMessage,
  Conversation,
  Facility,
  FacilityDoctor,
  User,
} from "../models/index.js";
import { AppError } from "../utils/errors.js";
import { FACILITY_STATUS } from "../utils/constants.js";
import { notifyFacilityUsers } from "./notify.service.js";

export async function listConversations(userId) {
  const rows = await Conversation.find({ patientUserId: userId }).sort({ lastMessageAt: -1, updatedAt: -1 });
  const facIds = rows.map((r) => r.facilityId);
  const facilities = await Facility.find({ _id: { $in: facIds } }).select("name type city");
  const map = Object.fromEntries(facilities.map((f) => [String(f._id), f]));
  return rows.map((r) => ({
    id: String(r._id),
    facility: map[String(r.facilityId)] || null,
    lastPreview: r.lastPreview,
    lastMessageAt: r.lastMessageAt || r.updatedAt,
  }));
}

export async function openConversation(userId, facilityId) {
  const facility = await Facility.findOne({ _id: facilityId, status: FACILITY_STATUS.VERIFIED });
  if (!facility) throw new AppError("Provider not found.", 404, "NOT_FOUND");
  let conv = await Conversation.findOne({ patientUserId: userId, facilityId });
  if (!conv) {
    conv = await Conversation.create({ patientUserId: userId, facilityId, lastMessageAt: new Date() });
  }
  return conv;
}

export async function listMessages(userId, conversationId) {
  const conv = await Conversation.findOne({ _id: conversationId, patientUserId: userId });
  if (!conv) throw new AppError("Conversation not found.", 404, "NOT_FOUND");
  const messages = await ChatMessage.find({ conversationId: conv._id }).sort({ createdAt: 1 }).limit(200);
  return { conversation: conv, messages };
}

export async function sendMessage(userId, conversationId, body) {
  const text = String(body || "").trim();
  if (!text) throw new AppError("Type a message.", 422, "EMPTY");
  const conv = await Conversation.findOne({ _id: conversationId, patientUserId: userId });
  if (!conv) throw new AppError("Conversation not found.", 404, "NOT_FOUND");
  const msg = await ChatMessage.create({ conversationId: conv._id, senderUserId: userId, body: text });
  conv.lastMessageAt = new Date();
  conv.lastPreview = text.slice(0, 120);
  await conv.save();
  await notifyFacilityUsers(conv.facilityId, {
    title: "New patient message",
    body: text.slice(0, 80),
    kind: "MESSAGE",
    channel: "system",
  });
  return msg;
}

export async function providerInbox(user) {
  let facilityIds = [];
  if (user.facilityId) facilityIds = [user.facilityId];
  if (user.role === "DOCTOR") {
    const links = await FacilityDoctor.find({ userId: user._id, status: "ACTIVE" });
    facilityIds = links.map((l) => l.facilityId);
  }
  const rows = await Conversation.find({ facilityId: { $in: facilityIds } }).sort({ lastMessageAt: -1 }).limit(50);
  return rows;
}

export { User };
