import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { requirePatient } from "../middleware/requirePatient.js";
import { authLimiter, apiLimiter, otpRequestLimiter } from "../middleware/rateLimiter.js";
import { mobileController } from "../controllers/mobile.controller.js";
import mobileExtrasRoutes from "./mobileExtras.routes.js";

const patient = [authenticate, requirePatient];
const router = Router();

router.post("/auth/otp/request", otpRequestLimiter, mobileController.requestOtp);
router.post("/auth/otp/verify", authLimiter, mobileController.verifyOtp);
router.post("/auth/refresh", authLimiter, mobileController.refresh);
router.post("/auth/logout", authenticate, mobileController.logout);

router.get("/me", ...patient, mobileController.me);
router.patch("/me", ...patient, mobileController.patchMe);
router.patch("/me/location", ...patient, mobileController.patchLocation);
router.post("/geocode/reverse", ...patient, mobileController.reverseGeocode);

router.get("/providers", ...patient, mobileController.providers);
router.get("/providers/:id", ...patient, mobileController.providerOne);
router.get("/doctors", ...patient, mobileController.doctors);
router.get("/search", ...patient, mobileController.search);
router.get("/medicines", ...patient, mobileController.medicines);

router.get("/prescriptions", ...patient, mobileController.prescriptions);
router.get("/prescriptions/:id", ...patient, mobileController.prescriptionOne);
router.get("/reports", ...patient, mobileController.reports);
router.get("/reports/:id", ...patient, mobileController.reportOne);
router.get("/records", ...patient, mobileController.records);
router.get("/tips", ...patient, mobileController.tips);

router.get("/orders", ...patient, mobileController.orders);
router.post("/orders", ...patient, mobileController.createOrder);
router.get("/orders/:id", ...patient, mobileController.orderOne);
router.post("/orders/:id/cancel", ...patient, mobileController.cancelOrder);

router.get("/appointments", ...patient, mobileController.appointments);
router.post("/appointments", ...patient, mobileController.bookConsult);

router.get("/sync", ...patient, mobileController.sync);
router.get("/notifications", ...patient, mobileController.notifications);
router.post("/notifications/read", ...patient, mobileController.notificationsRead);

router.get("/conversations", ...patient, mobileController.conversations);
router.post("/conversations", ...patient, mobileController.openConversation);
router.get("/conversations/:id/messages", ...patient, mobileController.messages);
router.post("/conversations/:id/messages", ...patient, mobileController.sendMessage);

router.post("/ai", ...patient, apiLimiter, mobileController.ai);

// Routes added for the patient mobile app: lab bookings, health metrics,
// reminders, wallet, family, reviews, AI history, emergency, appointment
// cancel/reschedule and document downloads. Mounted last so the routes
// above always win.
router.use(mobileExtrasRoutes);

export default router;
