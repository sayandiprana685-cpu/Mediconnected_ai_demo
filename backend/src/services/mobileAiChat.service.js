import { AiConversation, AiMessage, TriageResult } from "../models/index.js";
import { AI_TRIAGE_LEVELS } from "../models/AiConversation.js";
import { AppError } from "../utils/errors.js";
import { assertObjectId } from "../utils/objectId.js";
import { runTextTriage, runVoiceTriage } from "./ai.service.js";
import { runPatientAi } from "./mobileAi.service.js";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEVEL_SEVERITY = { SELF_CARE: 0, ROUTINE: 1, URGENT: 2, EMERGENCY: 3, UNKNOWN: -1 };

// Shown when the assistant produced no usable text. Never a blank bubble and
// never an invented all-clear: the patient must be able to tell that the
// service did not answer.
const NO_ANSWER_TEXT =
  "I could not reach the health assistant just now. Your message is saved and will be retried. " +
  "If this is an emergency, use the Emergency button or call 108.";

function requireUuid(requestId) {
  const id = String(requestId || "").trim();
  if (!UUID_RX.test(id)) {
    throw new AppError("requestId must be a client-generated UUID.", 422, "REQUEST_ID_INVALID");
  }
  return id;
}

function serializeConversation(c, preview) {
  const o = c.toObject ? c.toObject() : c;
  return {
    id: String(o._id),
    title: o.title || "",
    language: o.language || "en",
    lastMessageAt: o.lastMessageAt,
    highestTriageLevel: o.highestTriageLevel || null,
    messageCount: o.messageCount || 0,
    archived: !!o.archived,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    ...(preview ? { lastPreview: preview } : {}),
  };
}

function serializeMessage(m) {
  const o = m.toObject ? m.toObject() : m;
  return {
    id: String(o._id),
    conversationId: String(o.conversationId),
    requestId: o.requestId || "",
    role: o.role,
    mode: o.mode || "TEXT",
    content: o.content,
    transcript: o.transcript || null,
    transcriptionConfidence: o.transcriptionConfidence ?? null,
    triageLevel: o.triageLevel || null,
    recommendedAction: o.recommendedAction || "",
    redFlags: o.redFlags || [],
    reasoning: o.reasoning || [],
    predictedConditions: o.predictedConditions || [],
    disclaimer: o.disclaimer || "",
    actions: o.actions || [],
    speak: !!o.speak,
    status: o.status || "SENT",
    degraded: !!o.degraded,
    clientCreatedAt: o.clientCreatedAt || null,
    createdAt: o.createdAt,
  };
}

/** GET /api/mobile/ai/conversations */
export async function listAiConversations(userId, { limit, includeArchived } = {}) {
  const filter = includeArchived ? { userId } : { userId, archived: false };
  const cap = Math.min(Number(limit) || 30, 100);
  const rows = await AiConversation.find(filter).sort({ lastMessageAt: -1 }).limit(cap);
  const ids = rows.map((r) => r._id);
  // One query for every thread's newest message instead of one per thread.
  const lastMessages = await AiMessage.aggregate([
    { $match: { conversationId: { $in: ids } } },
    { $sort: { createdAt: 1 } },
    { $group: { _id: "$conversationId", last: { $last: "$$ROOT" } } },
  ]);
  const previewMap = Object.fromEntries(
    lastMessages.map((x) => [String(x._id), String(x.last?.content || "").slice(0, 120)])
  );
  return rows.map((r) => serializeConversation(r, previewMap[String(r._id)] || ""));
}

/** POST /api/mobile/ai/conversations — start a fresh thread. */
export async function createAiConversation(user, patient, body = {}) {
  const count = await AiConversation.countDocuments({ userId: user._id });
  if (count >= 200) {
    throw new AppError("You have reached the limit of 200 saved conversations. Delete an older one.", 422, "TOO_MANY_CONVERSATIONS");
  }
  const conv = await AiConversation.create({
    userId: user._id,
    patientId: patient?._id,
    title: String(body.title || "").slice(0, 120) || undefined,
    language: String(body.language || patient?.languagePreference || "en").slice(0, 8),
  });
  return serializeConversation(conv);
}

/** GET /api/mobile/ai/conversations/:id/messages */
export async function listAiMessages(userId, conversationId, { limit } = {}) {
  const id = assertObjectId(conversationId, "conversationId", "CONVERSATION_INVALID");
  const conv = await AiConversation.findOne({ _id: id, userId });
  if (!conv) throw new AppError("That conversation was not found.", 404, "NOT_FOUND");
  const cap = Math.min(Number(limit) || 100, 300);
  // Newest first from the database, then reversed so the chat renders top-to-bottom.
  const rows = await AiMessage.find({ conversationId: conv._id }).sort({ createdAt: -1, _id: -1 }).limit(cap);
  return { conversation: serializeConversation(conv), messages: rows.reverse().map(serializeMessage) };
}

/** DELETE /api/mobile/ai/conversations/:id — removes the thread and its messages. */
export async function deleteAiConversation(userId, conversationId) {
  const id = assertObjectId(conversationId, "conversationId", "CONVERSATION_INVALID");
  const conv = await AiConversation.findOneAndDelete({ _id: id, userId });
  if (!conv) throw new AppError("That conversation was not found.", 404, "NOT_FOUND");
  await AiMessage.deleteMany({ conversationId: conv._id });
  return { ok: true, id: String(conv._id) };
}

async function ensureConversation(user, patient, conversationId, language) {
  if (conversationId) {
    const id = assertObjectId(conversationId, "conversationId", "CONVERSATION_INVALID");
    const existing = await AiConversation.findOne({ _id: id, userId: user._id });
    if (!existing) throw new AppError("That conversation was not found.", 404, "NOT_FOUND");
    return existing;
  }
  return AiConversation.create({
    userId: user._id,
    patientId: patient?._id,
    language: String(language || patient?.languagePreference || "en").slice(0, 8),
  });
}

/**
 * Turn the triage envelope into the sentence the assistant actually says.
 * The recommended action comes first because it is the only part that tells the
 * patient what to DO; the reasoning follows so the answer is not a bare verdict.
 */
function composeReply(envelope) {
  const t = envelope?.triage || {};
  const parts = [];
  if (t.recommendedAction) parts.push(String(t.recommendedAction).trim());
  if (t.selfCareAdvice) parts.push(String(t.selfCareAdvice).trim());
  if (!parts.length && Array.isArray(t.reasoning) && t.reasoning.length) {
    parts.push(t.reasoning.join(" "));
  }
  if (!parts.length) parts.push(NO_ANSWER_TEXT);
  return parts.join("\n\n");
}

function levelOf(envelope) {
  const lvl = envelope?.triage?.triageLevel;
  return AI_TRIAGE_LEVELS.includes(lvl) ? lvl : "UNKNOWN";
}

/**
 * POST /api/mobile/ai/chat — one round trip for the whole assistant turn.
 *
 * Runs the Python triage service through the existing, already-tested
 * ai.service.js path, asks the local navigator which screen (if any) the reply
 * should offer to open, and persists both halves of the exchange to
 * `aiconversations` / `aimessages`. Text and voice return the same shape, so
 * the app writes one parser for both.
 *
 * `requestId` is the idempotency key. It is unique in TriageResult and unique
 * per thread in AiMessage, so an offline queue that replays the same message
 * after reconnecting updates the existing rows instead of duplicating them.
 */
export async function runAiChat({ user, patient, body = {}, file }) {
  const requestId = requireUuid(body.requestId);
  const mode = file?.buffer?.length || body.audioBase64 ? "VOICE" : "TEXT";

  const language = String(body.language || patient?.languagePreference || "en").slice(0, 8);
  const source = body.source === "OFFLINE_SYNC" ? "OFFLINE_SYNC" : "ONLINE";
  const clientCreatedAt = body.clientCreatedAt ? new Date(body.clientCreatedAt) : undefined;
  if (body.clientCreatedAt && Number.isNaN(clientCreatedAt?.getTime())) {
    throw new AppError("clientCreatedAt is not a valid date.", 422, "DATE_INVALID");
  }
  const deviceLabel = String(body.deviceLabel || "").slice(0, 120) || undefined;

  const conv = await ensureConversation(user, patient, body.conversationId, language);

  const symptoms = parseJsonArray(body.symptoms);
  const vitals = parseJsonObject(body.vitals);
  const patientContext = parseJsonObject(body.patientContext) || defaultContext(patient);

  let envelope;
  if (mode === "VOICE") {
    const audio = file?.buffer?.length
      ? file
      : bufferFromBase64(body.audioBase64, {
          mimetype: body.audioMimeType,
          filename: body.audioFilename,
        });
    if (!audio) throw new AppError("An audio recording is required for a voice message.", 422, "AUDIO_REQUIRED");
    envelope = await runVoiceTriage({
      requestId,
      patientId: patient?._id,
      file: audio,
      fields: {
        language,
        returnVoiceResponse: String(body.returnVoiceResponse) !== "false",
        symptoms,
        vitals,
        patientContext,
      },
      source,
      clientCreatedAt,
      deviceLabel,
    });
  } else {
    const text = String(body.message || "").trim();
    if (!text) throw new AppError("Type a message or record your voice.", 422, "MESSAGE_REQUIRED");
    envelope = await runTextTriage({
      requestId,
      patientId: patient?._id,
      payload: { text: text.slice(0, 4000), symptoms, vitals, patientContext, language },
      source,
      clientCreatedAt,
      deviceLabel,
    });
  }

  // The navigator decides which screen the reply can offer to open. It runs on
  // the transcript for voice, so speaking "find a hospital" navigates too.
  const navigatorText = String(envelope?.transcript || body.message || "").trim();
  let navigation = { text: "", actions: [], speak: true };
  if (navigatorText) {
    try {
      navigation = await runPatientAi({
        message: navigatorText,
        history: [],
        patient,
        query: { district: patient?.district, city: patient?.city, lat: patient?.geo?.lat, lng: patient?.geo?.lng },
      });
    } catch (err) {
      // Navigation is a convenience. If it fails the clinical answer still
      // stands on its own, so this must never fail the turn.
      console.error("[ai-chat] navigator failed", err.message);
    }
  }

  const level = levelOf(envelope);
  const replyText = composeReply(envelope);
  const disclaimer = envelope?.triage?.disclaimer || DEFAULT_DISCLAIMER;
  const degraded = Boolean(envelope?.triage?.degraded) || envelope?.status === "fallback";

  const userText = mode === "VOICE" ? envelope?.transcript || "[voice message]" : navigatorText;

  const [userMsg, assistantMsg] = await persistExchange({
    conv,
    user,
    requestId,
    mode,
    userText,
    replyText,
    envelope,
    navigation,
    level,
    disclaimer,
    degraded,
    source,
    clientCreatedAt,
  });

  await touchConversation(conv, { level, title: userText });

  return {
    conversation: serializeConversation(conv),
    userMessage: serializeMessage(userMsg),
    assistantMessage: serializeMessage(assistantMsg),
    // Passed straight through so the app can show red flags, predicted
    // conditions and the spoken reply without a second call.
    triage: envelope,
    navigation: { actions: navigation.actions || [], searchPreview: navigation.searchPreview || null },
    voiceResponse: envelope?.voiceResponse || null,
    idempotentReplay: Boolean(envelope?.idempotentReplay),
  };
}

const DEFAULT_DISCLAIMER =
  "AI guidance only - not a medical diagnosis. Consult a doctor for medical concerns.";

async function persistExchange({
  conv, user, requestId, mode, userText, replyText, envelope, navigation, level, disclaimer, degraded, source, clientCreatedAt,
}) {
  const t = envelope?.triage || {};
  const common = { conversationId: conv._id, userId: user._id, requestId };

  // A replayed requestId hits the unique index on (conversationId, requestId).
  // Treat that as success and return what is already stored, so an offline
  // queue draining twice cannot double-post a message.
  const existingUser = await AiMessage.findOne({ conversationId: conv._id, requestId, role: "user" });
  if (existingUser) {
    const existingAssistant = await AiMessage.findOne({ conversationId: conv._id, requestId, role: "assistant" });
    if (existingAssistant) return [existingUser, existingAssistant];
  }

  const userMsg = existingUser || (await AiMessage.create({
    ...common,
    role: "user",
    mode,
    content: userText.slice(0, 8000),
    transcript: mode === "VOICE" ? envelope?.transcript || null : null,
    transcriptionConfidence: envelope?.transcriptionConfidence ?? null,
    status: source === "OFFLINE_SYNC" ? "QUEUED" : "SENT",
    clientCreatedAt: clientCreatedAt || undefined,
  }));

  const assistantMsg = await createAssistantMessage({
    ...common,
    role: "assistant",
    mode,
    content: replyText.slice(0, 8000),
    triageLevel: level,
    recommendedAction: t.recommendedAction ? String(t.recommendedAction).slice(0, 1000) : "",
    redFlags: (t.redFlags || []).map((f) => f?.label || f?.code).filter(Boolean).slice(0, 20),
    reasoning: (t.reasoning || []).map(String).slice(0, 20),
    predictedConditions: (t.predictedConditions || [])
      .map((c) => ({ condition: c?.condition, confidence: c?.confidence }))
      .slice(0, 10),
    disclaimer: String(disclaimer).slice(0, 600),
    actions: (navigation.actions || []).slice(0, 5),
    speak: navigation.speak !== false,
    status: degraded ? "FAILED" : "SENT",
    degraded,
    clientCreatedAt: clientCreatedAt || undefined,
  });

  return [userMsg, assistantMsg];
}

/**
 * Insert the assistant row, treating a duplicate (conversationId, requestId) as
 * success. Two replays of one queued message can both pass the lookup above and
 * race to insert; the loser refetches what the winner wrote instead of failing
 * the whole turn with an E11000.
 */
async function createAssistantMessage(fields) {
  try {
    return await AiMessage.create(fields);
  } catch (err) {
    if (err?.code !== 11000) throw err;
    const stored = await AiMessage.findOne({
      conversationId: fields.conversationId,
      requestId: fields.requestId,
      role: "assistant",
    });
    if (!stored) throw err;
    return stored;
  }
}

async function touchConversation(conv, { level, title }) {
  conv.lastMessageAt = new Date();
  conv.messageCount = await AiMessage.countDocuments({ conversationId: conv._id });
  if (!conv.title && title) conv.title = title.slice(0, 120);
  // Keep the worst level the thread has seen, so a conversation that once said
  // EMERGENCY stays flagged even after calmer messages follow it.
  const current = LEVEL_SEVERITY[conv.highestTriageLevel] ?? -1;
  const next = LEVEL_SEVERITY[level] ?? -1;
  if (next > current) conv.highestTriageLevel = level;
  await conv.save();
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Age band, sex and pregnancy-adjacent context materially change a triage
 * level, so the patient's stored details are attached automatically instead of
 * relying on them to mention it in the message.
 */
function defaultContext(patient) {
  if (!patient) return undefined;
  const ctx = {};
  if (patient.age != null) ctx.age = patient.age;
  if (patient.dateOfBirth && patient.age == null) {
    ctx.age = Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  }
  if (patient.sex) ctx.sex = String(patient.sex).toLowerCase();
  if (patient.bloodGroup) ctx.bloodGroup = patient.bloodGroup;
  if (patient.allergies?.length) ctx.allergies = patient.allergies;
  return Object.keys(ctx).length ? ctx : undefined;
}

/**
 * Offline voice notes are queued on the phone as base64 because a multipart
 * stream cannot be replayed from local storage. Rebuild the multer-shaped file
 * object runVoiceTriage expects.
 *
 * The declared mimetype is honoured rather than assumed to be wav: a queued m4a
 * labelled as wav can make the transcription service fail on it. Anything that
 * is not audio/* is re-derived from the filename, and only then defaulted.
 */
const AUDIO_EXTENSIONS = ["webm", "wav", "mp3", "m4a", "aac", "ogg", "opus", "amr", "flac", "mp4"];

function bufferFromBase64(b64, { mimetype, filename } = {}) {
  const raw = String(b64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!raw) return null;
  let buffer;
  try {
    buffer = Buffer.from(raw, "base64");
  } catch {
    return null;
  }
  if (!buffer.length) return null;

  const declared = String(mimetype || "").trim();
  const name = String(filename || "").trim();
  const ext = AUDIO_EXTENSIONS.find((e) => name.toLowerCase().endsWith(`.${e}`));

  const resolvedType = declared.startsWith("audio/")
    ? declared.slice(0, 80)
    : `audio/${ext || "wav"}`;
  const resolvedName = name.slice(0, 120) || `queued-voice.${ext || "wav"}`;

  return { buffer, mimetype: resolvedType, originalname: resolvedName };
}

/**
 * GET /api/mobile/ai/history — the patient's triage results, newest first,
 * across every conversation. Backed by TriageResult, which already stores one
 * row per request, so nothing is duplicated here.
 */
export async function listAiHistory(patientId, { limit } = {}) {
  const cap = Math.min(Number(limit) || 20, 100);
  const rows = await TriageResult.find({ patientId })
    .sort({ createdAt: -1 })
    .limit(cap)
    .select("-input.vitals -input.patientContext");
  return rows.map((r) => {
    const o = r.toObject();
    return {
      requestId: o.requestId,
      mode: o.mode,
      language: o.language,
      said: o.transcription?.text || o.input?.text || "",
      triageLevel: o.result?.triageLevel || "UNKNOWN",
      recommendedAction: o.result?.recommendedAction || "",
      redFlags: (o.result?.redFlags || []).map((f) => f.label || f.code).filter(Boolean),
      reasoning: o.result?.reasoning || [],
      disclaimer: o.result?.disclaimer || DEFAULT_DISCLAIMER,
      degraded: !!o.result?.degraded,
      status: o.status,
      source: o.source,
      clientCreatedAt: o.clientCreatedAt || null,
      createdAt: o.createdAt,
    };
  });
}

export { DEFAULT_DISCLAIMER };
