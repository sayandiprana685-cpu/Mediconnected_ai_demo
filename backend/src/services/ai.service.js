import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { TriageResult, RiskScore, Patient } from "../models/index.js";
import { cacheGet, cacheSet, triageCacheKey, riskCacheKey, cacheStatus } from "./aiCache.service.js";
import { enqueue, queueDepth, queueStatus, startDrain } from "./aiQueue.service.js";

// The ONLY place in the Node backend that talks to the Python AI service.
// React Native and the React web dashboard never call Python directly - they
// call these functions through the AI routes, which keeps the service key, the
// patient identity check, the Mongo write and the Redis cache in one place.

const API_PREFIX = "/api/v1";

// ---------------------------------------------------------------------------
// Case conversion. The Python API is snake_case, this backend and the React
// clients are camelCase. Keys are converted; values are never touched, so a
// clinical code like "CHEST_PAIN" survives intact.
// ---------------------------------------------------------------------------

const toSnakeKey = (key) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamelKey = (key) => key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

function snakeify(value) {
  if (Array.isArray(value)) return value.map(snakeify);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [toSnakeKey(k), snakeify(v)]));
  }
  return value;
}

function camelize(value) {
  if (Array.isArray(value)) return value.map(camelize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [toCamelKey(k), camelize(v)]));
  }
  return value;
}

// ---------------------------------------------------------------------------
// HTTP core
// ---------------------------------------------------------------------------

function authHeaders(requestId, extra = {}) {
  const headers = { ...extra };
  if (env.ai.serviceKey) headers["X-AI-Service-Key"] = env.ai.serviceKey;
  if (requestId) headers["X-Request-Id"] = requestId;
  return headers;
}

/**
 * Call the Python service. Never throws for connectivity problems: it returns
 * `{ ok: false, retryable }` so callers can degrade gracefully, which is the
 * whole point of an offline-first deployment.
 */
async function callAi(path, { method = "POST", body, form, timeoutMs = env.ai.timeoutMs, requestId } = {}) {
  if (!env.ai.baseUrl) {
    return { ok: false, retryable: false, code: "AI_NOT_CONFIGURED", message: "AI_TRIAGE_API_URL is not set." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = form
      ? // No Content-Type here: fetch generates the multipart boundary itself.
        authHeaders(requestId)
      : authHeaders(requestId, { "Content-Type": "application/json" });

    const res = await fetch(`${env.ai.baseUrl}${API_PREFIX}${path}`, {
      method,
      headers,
      body: form || (body === undefined ? undefined : JSON.stringify(snakeify(body))),
      signal: controller.signal,
    });

    const retryable = res.headers.get("X-Retryable") === "true";
    if (!res.ok) {
      let detail = {};
      try {
        detail = await res.json();
      } catch {
        /* a non-JSON error page is still an error; keep the status */
      }
      return {
        ok: false,
        retryable: retryable || res.status >= 500,
        status: res.status,
        code: detail?.error?.code || `AI_HTTP_${res.status}`,
        message: detail?.error?.message || `AI service returned ${res.status}.`,
      };
    }

    return { ok: true, status: res.status, data: camelize(await res.json()) };
  } catch (err) {
    const timedOut = err.name === "AbortError";
    return {
      ok: false,
      // A timeout or a refused connection is transient - queue it and replay.
      retryable: true,
      code: timedOut ? "AI_TIMEOUT" : "AI_UNREACHABLE",
      message: timedOut
        ? `AI service did not respond within ${timeoutMs}ms.`
        : `AI service is unreachable: ${err.message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function aiHealth() {
  const remote = await callAi("/health", { method: "GET", timeoutMs: 4000 });
  return {
    configured: Boolean(env.ai.baseUrl),
    baseUrl: env.ai.baseUrl || null,
    cache: cacheStatus(),
    queue: { ...queueStatus(), depth: await queueDepth() },
    remote: remote.ok ? remote.data : { ok: false, code: remote.code, message: remote.message },
  };
}

// ---------------------------------------------------------------------------
// Graceful fallback
// ---------------------------------------------------------------------------

const FALLBACK_DISCLAIMER =
  "This is decision support only, not a diagnosis. A qualified health worker must confirm any clinical decision.";

/**
 * Returned when the Python service cannot answer. The level is UNKNOWN rather
 * than SELF_CARE: silently telling a patient "you are fine" because a server
 * was down would be the most dangerous possible failure mode.
 */
function fallbackResponse({ requestId, mode, reason }) {
  return {
    requestId,
    status: "fallback",
    mode,
    transcript: null,
    detectedLanguage: null,
    triage: {
      triageLevel: "UNKNOWN",
      recommendedAction:
        "The triage service is temporarily unavailable. Please contact your ASHA or the nearest PHC. " +
        "If there is chest pain, breathlessness, heavy bleeding, unconsciousness or a seizure, call 108 or go to the nearest hospital now.",
      referralSuggestion: "Nearest PHC or 108 ambulance - do not wait for this service to recover.",
      selfCareAdvice: null,
      predictedConditions: [],
      redFlags: [],
      reasoning: [`Triage could not be completed: ${reason}`],
      detectedSymptoms: [],
      modelVersion: null,
      rulesVersion: null,
      degraded: true,
      degradationReason: reason,
      disclaimer: FALLBACK_DISCLAIMER,
    },
    voiceResponse: null,
    idempotentReplay: false,
    meta: { processedAt: new Date().toISOString(), durationMs: 0 },
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Insert, treating a duplicate requestId as success. Two devices retrying the
 * same offline sync, or two API pods racing, both hit the unique index; the
 * second writer must replay the first writer's row instead of erroring.
 */
async function createOrReplay(model, doc, uniqueQuery) {
  try {
    return { doc: await model.create(doc), replayed: false };
  } catch (err) {
    if (err?.code === 11000) {
      const existing = await model.findOne(uniqueQuery);
      if (existing) return { doc: existing, replayed: true };
    }
    throw err;
  }
}

/** Storing a result must never cost the patient their answer. */
async function safePersist(label, fn) {
  try {
    return await fn();
  } catch (err) {
    console.error(`[ai] failed to persist ${label}: ${err.message}`);
    return null;
  }
}

function toTriageResponse(doc) {
  // Rebuilt from the stored fields. Audio is intentionally not retained (it is
  // large and re-synthesizable), so a database-served replay reports the spoken
  // text but no attachment; a retry inside the Redis TTL still gets the audio.
  const voiceReply = doc.voiceReply;
  return {
    requestId: doc.requestId,
    status: doc.status === "OK" ? "ok" : "fallback",
    mode: doc.mode,
    transcript: doc.transcription?.text || doc.input?.text || null,
    detectedLanguage: doc.transcription?.language || doc.language || null,
    transcriptionConfidence: doc.transcription?.confidence ?? null,
    triage: doc.result,
    voiceResponse: voiceReply?.text
      ? {
          available: false,
          text: voiceReply.text,
          language: voiceReply.language,
          audioBase64: null,
          reasonUnavailable: "Audio is not retained after first delivery; the spoken text is unchanged.",
        }
      : null,
    idempotentReplay: true,
    meta: { processedAt: doc.updatedAt?.toISOString?.() || new Date().toISOString(), durationMs: 0 },
  };
}

function triageDocFromResponse({ requestId, patientId, facilityId, mode, payload, data, status, source, clientCreatedAt, deviceLabel }) {
  return {
    requestId,
    patientId,
    facilityId: facilityId || undefined,
    mode,
    language: data?.detectedLanguage || payload?.language || "en",
    input: {
      text: payload?.text || data?.transcript || undefined,
      symptoms: (payload?.symptoms || []).map((s) => s?.name).filter(Boolean),
      vitals: payload?.vitals,
      patientContext: payload?.patientContext,
    },
    transcription: data?.transcript
      ? {
          text: data.transcript,
          language: data.detectedLanguage || undefined,
          confidence: data.transcriptionConfidence ?? undefined,
        }
      : undefined,
    result: {
      triageLevel: data?.triage?.triageLevel || "UNKNOWN",
      recommendedAction: data?.triage?.recommendedAction,
      referralSuggestion: data?.triage?.referralSuggestion,
      selfCareAdvice: data?.triage?.selfCareAdvice,
      predictedConditions: data?.triage?.predictedConditions || [],
      redFlags: data?.triage?.redFlags || [],
      reasoning: data?.triage?.reasoning || [],
      detectedSymptoms: data?.triage?.detectedSymptoms || [],
      modelVersion: data?.triage?.modelVersion,
      rulesVersion: data?.triage?.rulesVersion,
      degraded: Boolean(data?.triage?.degraded),
      degradationReason: data?.triage?.degradationReason,
      disclaimer: data?.triage?.disclaimer || FALLBACK_DISCLAIMER,
    },
    voiceReply: data?.voiceResponse
      ? {
          language: data.voiceResponse.language,
          text: data.voiceResponse.text,
          available: Boolean(data.voiceResponse.available),
        }
      : undefined,
    status,
    source,
    clientCreatedAt: clientCreatedAt ? new Date(clientCreatedAt) : undefined,
    deviceLabel,
  };
}

// ---------------------------------------------------------------------------
// Triage
// ---------------------------------------------------------------------------

function requireRequestId(requestId) {
  const id = String(requestId || "").trim();
  if (!id) throw new AppError("requestId is required for idempotent triage.", 422, "REQUEST_ID_REQUIRED");
  return id;
}

/**
 * Text triage. `payload` is the client's camelCase body (text, symptoms,
 * vitals, patientContext, language); it is converted for Python and the
 * response is converted back.
 *
 * On failure the caller still gets a usable response shape, so a React Native
 * screen never has to branch on "did the AI service exist".
 */
export async function runTextTriage({
  requestId,
  patientId,
  facilityId,
  payload,
  source = "ONLINE",
  clientCreatedAt,
  deviceLabel,
  allowQueue = true,
}) {
  const id = requireRequestId(requestId);

  const cached = await cacheGet(triageCacheKey(id));
  if (cached) return { ...cached, idempotentReplay: true };

  const existing = await safePersist("triage lookup", () => TriageResult.findOne({ requestId: id }));
  if (existing) return toTriageResponse(existing);

  const body = { ...payload, requestId: id, patientId: patientId ? String(patientId) : undefined };
  const res = await callAi("/triage/text", { body, requestId: id });

  if (!res.ok) {
    return degradeTriage({
      requestId: id, patientId, facilityId, payload, res, mode: "TEXT",
      source, clientCreatedAt, deviceLabel, allowQueue, queueKind: "TRIAGE_TEXT",
    });
  }

  await persistTriage({
    requestId: id, patientId, facilityId, payload, data: res.data, mode: "TEXT",
    status: "OK", source, clientCreatedAt, deviceLabel,
  });
  await cacheSet(triageCacheKey(id), res.data);
  return res.data;
}

/**
 * Voice triage. `file` is the multer file object; the recording is streamed to
 * Python as multipart form data alongside the same structured companions the
 * text endpoint accepts.
 */
export async function runVoiceTriage({
  requestId,
  patientId,
  facilityId,
  file,
  fields = {},
  source = "ONLINE",
  clientCreatedAt,
  deviceLabel,
  allowQueue = true,
}) {
  const id = requireRequestId(requestId);
  if (!file?.buffer?.length) throw new AppError("An audio recording is required.", 422, "AUDIO_REQUIRED");

  const cached = await cacheGet(triageCacheKey(id));
  if (cached) return { ...cached, idempotentReplay: true };

  const existing = await safePersist("triage lookup", () => TriageResult.findOne({ requestId: id }));
  if (existing) return toTriageResponse(existing);

  // Replaying a queued job re-uploads the recording, so the buffer is carried
  // in the job payload as base64 rather than re-read from a temp file.
  const form = buildVoiceForm({ requestId: id, patientId, facilityId, file, fields });
  const res = await callAi("/triage/voice", { form, timeoutMs: env.ai.voiceTimeoutMs, requestId: id });

  const payload = {
    text: fields.text,
    language: fields.language,
    symptoms: fields.symptoms || [],
    vitals: fields.vitals,
    patientContext: fields.patientContext,
  };

  if (!res.ok) {
    return degradeTriage({
      requestId: id, patientId, facilityId, payload, res, mode: "VOICE",
      source, clientCreatedAt, deviceLabel, allowQueue, queueKind: "TRIAGE_VOICE",
      queuePayload: { file: { buffer: file.buffer.toString("base64"), mimetype: file.mimetype, originalname: file.originalname } },
    });
  }

  await persistTriage({
    requestId: id, patientId, facilityId, payload, data: res.data, mode: "VOICE",
    status: "OK", source, clientCreatedAt, deviceLabel,
  });
  await cacheSet(triageCacheKey(id), res.data);
  return res.data;
}

function buildVoiceForm({ requestId, patientId, facilityId, file, fields }) {
  const form = new FormData();
  form.append(
    "audio",
    new Blob([file.buffer], { type: file.mimetype || "audio/wav" }),
    file.originalname || "recording.wav"
  );
  form.append("request_id", requestId);
  if (patientId) form.append("patient_id", String(patientId));
  if (facilityId) form.append("facility_id", String(facilityId));
  if (fields.language) form.append("language", fields.language);
  form.append("return_voice_response", String(fields.returnVoiceResponse !== false));
  // Structured companions travel as JSON strings because the request is multipart.
  if (fields.symptoms?.length) form.append("symptoms", JSON.stringify(snakeify(fields.symptoms)));
  if (fields.vitals) form.append("vitals", JSON.stringify(snakeify(fields.vitals)));
  if (fields.patientContext) form.append("patient_context", JSON.stringify(snakeify(fields.patientContext)));
  return form;
}

async function persistTriage(args) {
  const doc = triageDocFromResponse(args);
  if (!doc.patientId) return null;
  return safePersist(`triage ${args.requestId}`, async () => {
    const { doc: saved, replayed } = await createOrReplay(TriageResult, doc, { requestId: args.requestId });
    return { saved, replayed };
  });
}

/**
 * Shared failure path: record that we could not answer, park a replay job when
 * the failure was transient, and hand the client a safe fallback.
 */
async function degradeTriage({
  requestId, patientId, facilityId, payload, res, mode,
  source, clientCreatedAt, deviceLabel, allowQueue, queueKind, queuePayload = {},
}) {
  const fallback = fallbackResponse({ requestId, mode, reason: res.message });

  await persistTriage({
    requestId, patientId, facilityId, payload, data: fallback, mode,
    status: res.retryable && allowQueue ? "QUEUED" : "FALLBACK",
    source, clientCreatedAt, deviceLabel,
  });

  if (res.retryable && allowQueue) {
    const queued = await enqueue(queueKind, {
      requestId,
      patientId: patientId ? String(patientId) : undefined,
      facilityId: facilityId ? String(facilityId) : undefined,
      payload,
      source,
      clientCreatedAt,
      deviceLabel,
      ...queuePayload,
    });
    if (!queued) {
      console.error(`[ai] burst queue is full; dropping replay for ${requestId}`);
    }
  }

  return fallback;
}

// ---------------------------------------------------------------------------
// Risk scoring
// ---------------------------------------------------------------------------

const RISK_PATHS = {
  MATERNAL: "/risk-score/maternal",
  CHILD: "/risk-score/child",
  CHRONIC: "/risk-score/chronic",
};

function riskDocFromResponse({ requestId, patientId, facilityId, domain, payload, data, status, scoredBy, triggeredBy }) {
  const result = data?.result || {};
  return {
    requestId,
    patientId,
    facilityId: facilityId || undefined,
    domain,
    result: {
      riskLevel: result.riskLevel,
      riskScore: result.riskScore,
      followUpPriority: result.followUpPriority,
      reasons: result.reasons || [],
      recommendedActions: result.recommendedActions || [],
      followUpIntervalDays: result.followUpIntervalDays,
      escalateToFacility: Boolean(result.escalateToFacility),
      dataQuality: result.dataQuality,
      rulesVersion: result.rulesVersion,
      disclaimer: result.disclaimer || FALLBACK_DISCLAIMER,
    },
    input: payload,
    scoredBy,
    status,
    triggeredBy,
  };
}

/**
 * Score one patient in one domain. Used both by health-worker screens and by
 * the nightly cron, which is why `scoredBy` is a parameter rather than a guess.
 */
export async function runRiskScore(domain, payload, { scoredBy = "API", triggeredBy, facilityId } = {}) {
  const key = String(domain).toUpperCase();
  if (!RISK_PATHS[key]) throw new AppError(`Unknown risk domain: ${domain}`, 422, "UNKNOWN_DOMAIN");

  const requestId = requireRequestId(payload?.requestId);
  const cacheKey = riskCacheKey(key, requestId);

  const cached = await cacheGet(cacheKey);
  if (cached) return { ...cached, idempotentReplay: true };

  const existing = await safePersist("risk lookup", () => RiskScore.findOne({ requestId, domain: key }));
  if (existing) return { requestId, patientId: String(existing.patientId), domain: key, status: "ok", result: existing.result, idempotentReplay: true };

  const body = { ...payload, requestId };
  const res = await callAi(RISK_PATHS[key], { body, requestId });

  if (!res.ok) {
    const retryable = res.retryable && scoredBy !== "CRON";
    if (retryable) {
      await enqueue("RISK_SCORE", { domain: key, payload, scoredBy, triggeredBy, facilityId });
    }
    throw Object.assign(new AppError(res.message, res.status >= 400 && res.status < 500 ? res.status : 502, res.code), {
      retryable,
    });
  }

  const patientRef = await resolvePatientRef(payload.patientId);
  if (patientRef) {
    await safePersist(`risk ${requestId}`, () =>
      createOrReplay(
        RiskScore,
        riskDocFromResponse({
          requestId, patientId: patientRef, facilityId, domain: key, payload,
          data: res.data, status: "OK", scoredBy, triggeredBy,
        }),
        { requestId, domain: key }
      )
    );
  }

  await cacheSet(cacheKey, res.data);
  return res.data;
}

/**
 * Batch re-scoring for the cron job. One malformed record must not abort the
 * run, so the Python side scores each item independently and reports failures
 * per item; this wrapper persists whatever succeeded.
 */
export async function runRiskBatch(items, { triggeredBy = "cron", scoredBy = "CRON", facilityId } = {}) {
  const res = await callAi("/risk-score/batch", {
    body: { items, triggeredBy },
    timeoutMs: Math.max(env.ai.timeoutMs, 60000),
  });
  if (!res.ok) {
    throw Object.assign(
      new AppError(res.message, res.status >= 400 && res.status < 500 ? res.status : 502, res.code),
      { retryable: res.retryable }
    );
  }

  const data = res.data;
  const results = data?.results || [];
  const saved = await Promise.all(
    results.map(async (entry, index) => {
      if (!entry) return null;
      const item = items[index] || {};
      const domain = String(item.domain || entry.domain || "").toUpperCase();
      const requestId = entry.requestId || item[domain.toLowerCase()]?.requestId;
      const patientRef = await resolvePatientRef(entry.patientId);
      if (!requestId || !patientRef || !RISK_PATHS[domain]) return null;
      return safePersist(`risk batch ${requestId}`, () =>
        createOrReplay(
          RiskScore,
          riskDocFromResponse({
            requestId, patientId: patientRef, facilityId, domain,
            payload: item[domain.toLowerCase()], data: entry, status: "OK", scoredBy, triggeredBy,
          }),
          { requestId, domain }
        )
      );
    })
  );

  return { ...data, persisted: saved.filter(Boolean).length };
}

/**
 * Resolve a client-supplied patient identifier to a Mongo ObjectId. The Python
 * service only ever sees it as an opaque string, so the link back to the
 * Patient document is made here.
 */
async function resolvePatientRef(patientId) {
  if (!patientId) return null;
  const value = String(patientId);
  const query = value.match(/^[0-9a-fA-F]{24}$/) ? { _id: value } : { mrn: value };
  try {
    const patient = await Patient.findOne(query).select("_id");
    return patient?._id || null;
  } catch (err) {
    console.error(`[ai] could not resolve patient ${value}: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Queue replay
// ---------------------------------------------------------------------------

/**
 * Re-run a parked job once the AI service recovers. Throws so the queue can
 * count the attempt; a still-unavailable service is retryable, a permanent
 * rejection is not.
 */
export async function replayJob(job) {
  const { kind, payload } = job;

  if (kind === "TRIAGE_TEXT") {
    const out = await runTextTriage({ ...payload, allowQueue: false });
    if (out.status === "fallback") throw retryableError(out.triage?.degradationReason);
    return;
  }

  if (kind === "TRIAGE_VOICE") {
    const file = {
      buffer: Buffer.from(payload.file.buffer, "base64"),
      mimetype: payload.file.mimetype,
      originalname: payload.file.originalname,
    };
    const out = await runVoiceTriage({ ...payload, file, allowQueue: false });
    if (out.status === "fallback") throw retryableError(out.triage?.degradationReason);
    return;
  }

  if (kind === "RISK_SCORE") {
    try {
      await runRiskScore(payload.domain, payload.payload, {
        scoredBy: payload.scoredBy,
        triggeredBy: payload.triggeredBy,
        facilityId: payload.facilityId,
      });
    } catch (err) {
      if (err.retryable) throw retryableError(err.message);
      throw Object.assign(err, { retryable: false });
    }
    return;
  }

  throw Object.assign(new Error(`Unknown queue job kind: ${kind}`), { retryable: false });
}

function retryableError(message) {
  return Object.assign(new Error(message || "AI service still unavailable"), { retryable: true });
}

/** Register the replay handler. Called once from src/server.js after boot. */
export function startAiQueue() {
  startDrain(replayJob);
}

