import crypto from "crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { ROLES } from "../utils/constants.js";
import { authenticate, authorize } from "../middleware/authenticate.js";
import { requirePatient } from "../middleware/requirePatient.js";
import { resolveFacilityContext } from "../middleware/authorize.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";
import { aiController } from "../controllers/ai.controller.js";

const router = Router();

const patient = [authenticate, requirePatient];
// Clinical staff only. Pharmacists and lab staff have no reason to read a
// maternal or child risk score, so they are deliberately excluded.
const staff = [
  authenticate,
  authorize(ROLES.MAIN_ADMIN, ROLES.FACILITY_ADMIN, ROLES.DOCTOR),
  resolveFacilityContext,
];

// ---------------------------------------------------------------------------
// Voice upload
// ---------------------------------------------------------------------------

const ACCEPTED_AUDIO = /\.(webm|wav|mp3|m4a|aac|ogg|opus|amr|flac|mp4)$/i;

const upload = multer({
  // Memory storage: the recording is forwarded straight to the Python service
  // and, if that fails, carried in the burst queue. Nothing touches disk.
  storage: multer.memoryStorage(),
  limits: { fileSize: env.ai.maxVoiceBytes, files: 1 },
  fileFilter(req, file, cb) {
    const looksLikeAudio = file.mimetype.startsWith("audio/") || file.mimetype === "application/octet-stream";
    if (looksLikeAudio || ACCEPTED_AUDIO.test(file.originalname || "")) return cb(null, true);
    cb(new AppError(`Unsupported audio type '${file.mimetype}'.`, 422, "UNSUPPORTED_AUDIO"));
  },
});

/**
 * Multer reports an oversized or malformed upload as a MulterError with no HTTP
 * status, which the shared error handler would render as a 500. A field worker
 * on a slow connection needs "too large, record a shorter clip", not a server
 * error, so those are translated here.
 */
function voiceUpload(req, res, next) {
  upload.single("audio")(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const maxMb = Math.round(env.ai.maxVoiceBytes / (1024 * 1024));
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? `That recording is too large. Please keep it under ${maxMb} MB - a 60 second clip is plenty.`
          : `The recording could not be accepted (${err.code}). Please record again.`;
      return next(new AppError(message, 422, err.code));
    }
    next(err);
  });
}

// ---------------------------------------------------------------------------
// Validation. The Node layer checks the ENVELOPE (requestId, patientId) and
// lets the Python service validate the clinical payload - duplicating forty
// pydantic field constraints here would only create two places to disagree.
// ---------------------------------------------------------------------------

const requestId = z.string().uuid("requestId must be a client-generated UUID.");

const symptomSchema = z.object({
  name: z.string().min(1).max(120),
  durationDays: z.number().min(0).max(3650).optional(),
  severity: z.enum(["MILD", "MODERATE", "SEVERE"]).optional(),
  bodySite: z.string().max(80).optional(),
});

const textTriageSchema = z.object({
  body: z
    .object({
      requestId,
      text: z.string().max(4000).optional(),
      symptoms: z.array(symptomSchema).max(40).optional(),
      vitals: z.record(z.any()).optional(),
      patientContext: z.record(z.any()).optional(),
      language: z.enum(["en", "hi", "mr"]).optional(),
      source: z.enum(["ONLINE", "OFFLINE_SYNC"]).optional(),
      clientCreatedAt: z.string().datetime({ offset: true }).optional(),
      deviceLabel: z.string().max(120).optional(),
    })
    // Mirrors the Python validator: a triage request with nothing to triage is
    // a client bug, and rejecting it here saves a wasted round trip.
    .refine((b) => (b.text && b.text.trim()) || (b.symptoms && b.symptoms.length > 0), {
      message: "Provide either 'text' or at least one entry in 'symptoms'.",
      path: ["text"],
    }),
});

const riskEnvelope = z.object({
  requestId,
  patientId: z.string().min(1).max(120),
  facilityId: z.string().max(120).optional(),
});

// Clinical fields pass through untouched to the Python service.
const maternalRiskSchema = z.object({ body: riskEnvelope.passthrough() });
const childRiskSchema = z.object({ body: riskEnvelope.passthrough() });
const chronicRiskSchema = z.object({ body: riskEnvelope.passthrough() });

const batchRiskSchema = z.object({
  body: z.object({
    triggeredBy: z.string().max(120).optional(),
    items: z
      .array(
        z.object({
          domain: z.enum(["MATERNAL", "CHILD", "CHRONIC"]),
          maternal: z.record(z.any()).optional(),
          child: z.record(z.any()).optional(),
          chronic: z.record(z.any()).optional(),
        })
      )
      .min(1, "At least one item is required.")
      .max(100, "A batch is limited to 100 patients; split larger runs."),
  }),
});

// ---------------------------------------------------------------------------
// Cron auth. The scheduled re-scoring job has no user to sign in as, so it
// presents a shared key. Compared in constant time because it is a secret.
// ---------------------------------------------------------------------------

function constantTimeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function cronKey(req, res, next) {
  if (!env.ai.cronKey) {
    return next(new AppError("AI_CRON_KEY is not set, so batch re-scoring is disabled.", 503, "CRON_DISABLED"));
  }
  if (env.isProd && env.ai.cronKey.length < 32) {
    return next(new AppError("AI_CRON_KEY must be at least 32 characters in production.", 500, "CRON_MISCONFIGURED"));
  }
  const provided = req.header("x-cron-key");
  if (!provided || !constantTimeEqual(provided, env.ai.cronKey)) {
    return next(new AppError("Invalid cron key.", 401, "UNAUTHENTICATED"));
  }
  next();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Patient-facing triage: text chat and recorded voice.
router.post("/triage/text", ...patient, apiLimiter, validate(textTriageSchema), aiController.textTriage);
router.post("/triage/voice", ...patient, apiLimiter, voiceUpload, aiController.voiceTriage);
router.get("/triage", ...patient, apiLimiter, aiController.myTriage);
router.get("/triage/:requestId", ...patient, apiLimiter, aiController.triageByRequestId);

// Health-worker facing risk scores.
router.post("/risk-score/maternal", ...staff, apiLimiter, validate(maternalRiskSchema), aiController.maternalRisk);
router.post("/risk-score/child", ...staff, apiLimiter, validate(childRiskSchema), aiController.childRisk);
router.post("/risk-score/chronic", ...staff, apiLimiter, validate(chronicRiskSchema), aiController.chronicRisk);
router.get("/risk-score/latest", ...staff, apiLimiter, aiController.latestRisk);
router.get("/risk-score/worklist", ...staff, apiLimiter, aiController.worklist);

// The nightly re-scoring job. Accepts the cron key OR an authenticated admin,
// so it can be driven by an external scheduler or triggered by hand.
router.post(
  "/risk-score/batch",
  (req, res, next) => {
    if (req.header("x-cron-key")) return cronKey(req, res, next);
    return authenticate(req, res, (err) => {
      if (err) return next(err);
      return authorize(ROLES.MAIN_ADMIN, ROLES.FACILITY_ADMIN)(req, res, (err2) => {
        if (err2) return next(err2);
        return resolveFacilityContext(req, res, next);
      });
    });
  },
  apiLimiter,
  validate(batchRiskSchema),
  aiController.batchRisk
);

router.get("/health", ...staff, aiController.health);

export default router;
