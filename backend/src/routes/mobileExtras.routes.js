import multer from "multer";
import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { requirePatient } from "../middleware/requirePatient.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { mobileExtrasController as c } from "../controllers/mobileExtras.controller.js";

const patient = [authenticate, requirePatient];
const router = Router();

// ---------------------------------------------------------------------------
// Voice upload for the AI assistant. Mirrors ai.routes.js: memory storage so a
// recording is forwarded to the Python service and never touches disk, and the
// same accepted-extension list so both AI entry points behave identically.
// ---------------------------------------------------------------------------

const ACCEPTED_AUDIO = /\.(webm|wav|mp3|m4a|aac|ogg|opus|amr|flac|mp4)$/i;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.ai.maxVoiceBytes, files: 1 },
  fileFilter(req, file, cb) {
    const looksLikeAudio = file.mimetype.startsWith("audio/") || file.mimetype === "application/octet-stream";
    if (looksLikeAudio || ACCEPTED_AUDIO.test(file.originalname || "")) return cb(null, true);
    cb(new AppError(`Unsupported audio type '${file.mimetype}'.`, 422, "UNSUPPORTED_AUDIO"));
  },
});

/**
 * Multer reports an oversized recording as a MulterError with no HTTP status,
 * which the shared handler would render as a 500. Someone on a slow connection
 * needs "record a shorter clip", not a server error. Non-multipart requests
 * pass straight through, so this same route serves typed chat.
 */
function optionalVoice(req, res, next) {
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

// Lab tests, bookings and the referral trail.
router.get("/lab-tests", ...patient, apiLimiter, c.labTests);
router.post("/lab-orders", ...patient, apiLimiter, c.bookLabOrder);
router.get("/lab-orders", ...patient, c.labOrders);
router.get("/lab-orders/:id", ...patient, c.labOrderOne);
router.post("/lab-orders/:id/cancel", ...patient, c.cancelLabOrder);
router.get("/referrals", ...patient, c.referrals);

// Health metrics and medicine reminders.
router.get("/metrics", ...patient, c.metrics);
router.post("/metrics", ...patient, apiLimiter, c.addMetric);
router.delete("/metrics/:id", ...patient, c.deleteMetric);
router.get("/reminders", ...patient, c.reminders);
router.post("/reminders", ...patient, apiLimiter, c.createReminder);
router.patch("/reminders/:id", ...patient, apiLimiter, c.updateReminder);
router.delete("/reminders/:id", ...patient, c.deleteReminder);

// Health wallet. No payment gateway sits behind these; see mobileWallet.service.js.
router.get("/wallet", ...patient, c.wallet);
router.post("/wallet/topup", ...patient, apiLimiter, c.walletTopUp);
router.post("/wallet/pay", ...patient, apiLimiter, c.walletPay);
router.post("/wallet/refund", ...patient, apiLimiter, c.walletRefund);
router.get("/wallet/transactions", ...patient, c.walletTransactions);
router.post("/wallet/payment-methods", ...patient, apiLimiter, c.walletAddMethod);
router.delete("/wallet/payment-methods/:methodId", ...patient, c.walletRemoveMethod);
router.post("/wallet/coupons/apply", ...patient, apiLimiter, c.walletApplyCoupon);

// Family members, ratings and reviews.
router.get("/family", ...patient, c.family);
router.post("/family", ...patient, apiLimiter, c.createFamilyMember);
router.patch("/family/:id", ...patient, apiLimiter, c.updateFamilyMember);
router.delete("/family/:id", ...patient, c.deleteFamilyMember);
router.get("/reviews", ...patient, c.reviews);
router.post("/reviews", ...patient, apiLimiter, c.writeReview);
router.delete("/reviews/:id", ...patient, c.deleteReview);

// AI Health Assistant: conversation history plus the one-call chat turn.
router.get("/ai/conversations", ...patient, c.aiConversations);
router.post("/ai/conversations", ...patient, apiLimiter, c.createAiConversation);
router.get("/ai/conversations/:id/messages", ...patient, c.aiMessages);
router.delete("/ai/conversations/:id", ...patient, c.deleteAiConversation);
router.post("/ai/chat", ...patient, optionalVoice, apiLimiter, c.aiChat);
router.get("/ai/history", ...patient, c.aiHistory);

// Emergency, appointments and downloadable documents.
router.get("/emergency", ...patient, apiLimiter, c.emergency);
router.get("/appointments/detail", ...patient, c.appointmentsDetailed);
router.post("/appointments/:id/cancel", ...patient, apiLimiter, c.cancelAppointment);
router.post("/appointments/:id/reschedule", ...patient, apiLimiter, c.rescheduleAppointment);
router.get("/prescriptions/:id/pdf", ...patient, c.prescriptionPdf);
router.get("/reports/:id/pdf", ...patient, c.labReportPdf);

export default router;
