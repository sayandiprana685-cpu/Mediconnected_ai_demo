import { asyncHandler, AppError } from "../utils/errors.js";
import { TriageResult, RiskScore } from "../models/index.js";
import {
  aiHealth,
  runTextTriage,
  runVoiceTriage,
  runRiskScore,
  runRiskBatch,
} from "../services/ai.service.js";

// Controllers stay thin: identity comes from the middleware, the AI service
// owns the HTTP call, the cache, the queue and the Mongo write.

/**
 * Multipart form fields arrive as strings. Structured companions (symptoms,
 * vitals, patientContext) are sent as JSON inside those strings, so they need
 * parsing - and a malformed one must be a clean 422, never a crash.
 */
function parseJsonField(raw, field, fallback) {
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError(`The '${field}' form field must be valid JSON.`, 422, "INVALID_JSON_FIELD");
  }
}

function offlineSource(value) {
  return value === "OFFLINE_SYNC" ? "OFFLINE_SYNC" : "ONLINE";
}

function patientContextFrom(req) {
  const patient = req.patient;
  return {
    patientId: patient._id,
    facilityId: patient.homeFacilityId,
    language: patient.languagePreference || "en",
  };
}

const RISK_DOMAINS = ["MATERNAL", "CHILD", "CHRONIC"];

function requireDomain(value) {
  const domain = String(value || "").toUpperCase();
  if (!RISK_DOMAINS.includes(domain)) {
    throw new AppError(`domain must be one of ${RISK_DOMAINS.join(", ")}.`, 422, "UNKNOWN_DOMAIN");
  }
  return domain;
}

export const aiController = {
  /**
   * POST /api/ai/triage/text - typed chat input from the mobile app or website.
   * Accepts a client-generated requestId so an offline retry cannot duplicate.
   */
  textTriage: asyncHandler(async (req, res) => {
    const { requestId, text, symptoms, vitals, patientContext, language, source, clientCreatedAt, deviceLabel } =
      req.validated.body;
    const ctx = patientContextFrom(req);

    const data = await runTextTriage({
      requestId,
      patientId: ctx.patientId,
      facilityId: ctx.facilityId,
      payload: {
        text,
        symptoms,
        vitals,
        patientContext,
        // Fall back to the patient's stored preference so a Marathi-speaking
        // user gets a Marathi spoken reply without picking it every time.
        language: language || ctx.language,
      },
      source: offlineSource(source),
      clientCreatedAt,
      deviceLabel,
    });

    res.json(data);
  }),

  /**
   * POST /api/ai/triage/voice - recorded audio. Returns the SAME shape as the
   * text endpoint plus the transcript and an optional spoken reply, so a client
   * can use one parser for both interaction modes.
   */
  voiceTriage: asyncHandler(async (req, res) => {
    if (!req.file?.buffer?.length) {
      throw new AppError("An audio recording is required in the 'audio' form field.", 422, "AUDIO_REQUIRED");
    }
    const ctx = patientContextFrom(req);

    const data = await runVoiceTriage({
      requestId: req.body.requestId,
      patientId: ctx.patientId,
      facilityId: ctx.facilityId,
      file: req.file,
      fields: {
        language: req.body.language || ctx.language,
        returnVoiceResponse: req.body.returnVoiceResponse !== "false",
        symptoms: parseJsonField(req.body.symptoms, "symptoms", []),
        vitals: parseJsonField(req.body.vitals, "vitals", null),
        patientContext: parseJsonField(req.body.patientContext, "patientContext", null),
      },
      source: offlineSource(req.body.source),
      clientCreatedAt: req.body.clientCreatedAt,
      deviceLabel: req.body.deviceLabel,
    });

    res.json(data);
  }),

  maternalRisk: asyncHandler(async (req, res) => {
    res.json(await runRiskScore("MATERNAL", req.validated.body, { scoredBy: "API", facilityId: req.facilityId }));
  }),

  childRisk: asyncHandler(async (req, res) => {
    res.json(await runRiskScore("CHILD", req.validated.body, { scoredBy: "API", facilityId: req.facilityId }));
  }),

  chronicRisk: asyncHandler(async (req, res) => {
    res.json(await runRiskScore("CHRONIC", req.validated.body, { scoredBy: "API", facilityId: req.facilityId }));
  }),

  /**
   * POST /api/ai/risk-score/batch - the scheduled re-scoring job. Scores every
   * patient whose records changed since the last run; individual failures come
   * back per item so one bad record never aborts the whole night's work.
   */
  batchRisk: asyncHandler(async (req, res) => {
    const { items, triggeredBy } = req.validated.body;
    res.json(
      await runRiskBatch(items, {
        triggeredBy: triggeredBy || "cron:nightly-rescore",
        scoredBy: "CRON",
        facilityId: req.facilityId,
      })
    );
  }),

  /** GET /api/ai/health - is the Python service reachable, and is Redis up? */
  health: asyncHandler(async (req, res) => {
    res.json(await aiHealth());
  }),

  /**
   * GET /api/ai/triage - the patient's own triage history, newest first. The
   * mobile app reads this to reconcile records it queued while offline.
   */
  myTriage: asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const docs = await TriageResult.find({ patientId: req.patient._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("-input.vitals -input.patientContext");
    res.json({ count: docs.length, results: docs });
  }),

  /**
   * GET /api/ai/triage/:requestId - idempotency lookup. A device that timed out
   * mid-sync asks this before retrying, and gets the stored answer instead of
   * triggering a second transcription.
   */
  triageByRequestId: asyncHandler(async (req, res) => {
    const doc = await TriageResult.findOne({
      requestId: req.params.requestId,
      patientId: req.patient._id,
    });
    if (!doc) throw new AppError("No triage result was found for that requestId.", 404, "NOT_FOUND");
    res.json(doc);
  }),

  /**
   * GET /api/ai/risk-score/latest - the most recent score per domain for one
   * patient, which is what a health worker's summary screen shows.
   */
  latestRisk: asyncHandler(async (req, res) => {
    const patientId = req.query.patientId;
    if (!patientId) throw new AppError("patientId is required.", 422, "PATIENT_ID_REQUIRED");

    const domains = req.query.domain ? [requireDomain(req.query.domain)] : RISK_DOMAINS;
    const results = await Promise.all(
      domains.map(async (domain) => {
        const doc = await RiskScore.findOne({ patientId, domain }).sort({ createdAt: -1 });
        return { domain, score: doc || null };
      })
    );
    res.json({ patientId: String(patientId), results });
  }),

  /**
   * GET /api/ai/risk-score/worklist - the follow-up queue for a facility:
   * every patient whose latest score is MEDIUM or HIGH, worst first.
   */
  worklist: asyncHandler(async (req, res) => {
    const level = String(req.query.level || "HIGH,MEDIUM").toUpperCase().split(",").map((s) => s.trim());
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const facilityId = req.facilityId || req.query.facilityId;

    // Latest score per patient per domain, then filtered by level. Aggregating
    // rather than filtering in JS keeps this usable on a district-sized dataset.
    const pipeline = [
      { $match: facilityId ? { facilityId } : {} },
      { $sort: { createdAt: -1 } },
      { $group: {
          _id: { patientId: "$patientId", domain: "$domain" },
          doc: { $first: "$$ROOT" },
      } },
      { $match: { "doc.result.riskLevel": { $in: level } } },
      { $sort: { "doc.result.followUpPriority": -1, "doc.result.riskScore": -1 } },
      { $limit: limit },
      { $replaceRoot: { newRoot: "$doc" } },
    ];

    const docs = await RiskScore.aggregate(pipeline).allowDiskUse(true);
    res.json({ count: docs.length, level, worklist: docs });
  }),
};
