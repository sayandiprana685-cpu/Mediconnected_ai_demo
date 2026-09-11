import { Router } from "express";
import { doctorController } from "../controllers/doctor.controller.js";
import { authenticate, authorize } from "../middleware/authenticate.js";
import { resolveFacilityContext, requireFacility } from "../middleware/authorize.js";
import { ROLES } from "../utils/constants.js";

const router = Router();

router.get("/invite/:token", doctorController.previewInvite);
router.post("/invite/:token/otp", doctorController.requestInviteOtp);
router.post("/activate", doctorController.activate);

router.post("/invite/:token/accept", authenticate, authorize(ROLES.DOCTOR), doctorController.accept);
router.post("/invite/:token/decline", authenticate, authorize(ROLES.DOCTOR), doctorController.decline);

router.get(
  "/",
  authenticate,
  authorize(ROLES.FACILITY_ADMIN, ROLES.DOCTOR),
  resolveFacilityContext,
  requireFacility,
  doctorController.listFacilityDoctors
);
router.post(
  "/invite",
  authenticate,
  authorize(ROLES.FACILITY_ADMIN),
  resolveFacilityContext,
  requireFacility,
  doctorController.invite
);
router.get("/profile/me", authenticate, authorize(ROLES.DOCTOR), doctorController.profile);
router.patch("/profile/me", authenticate, authorize(ROLES.DOCTOR), doctorController.updateProfile);
router.patch(
  "/today-status",
  authenticate,
  authorize(ROLES.DOCTOR),
  resolveFacilityContext,
  requireFacility,
  doctorController.setTodayStatus
);
router.get("/schedule", authenticate, authorize(ROLES.DOCTOR), resolveFacilityContext, requireFacility, doctorController.getSchedule);
router.put("/schedule", authenticate, authorize(ROLES.DOCTOR), resolveFacilityContext, requireFacility, doctorController.saveSchedule);
router.get(
  "/availability",
  authenticate,
  authorize(ROLES.FACILITY_ADMIN, ROLES.DOCTOR),
  resolveFacilityContext,
  requireFacility,
  doctorController.facilityDoctorAvailability
);
router.get(
  "/:doctorUserId/schedule",
  authenticate,
  authorize(ROLES.FACILITY_ADMIN),
  resolveFacilityContext,
  requireFacility,
  doctorController.getDoctorSchedule
);
router.put(
  "/:doctorUserId/schedule",
  authenticate,
  authorize(ROLES.FACILITY_ADMIN),
  resolveFacilityContext,
  requireFacility,
  doctorController.saveDoctorSchedule
);
router.patch(
  "/:doctorUserId/access",
  authenticate,
  authorize(ROLES.FACILITY_ADMIN),
  resolveFacilityContext,
  requireFacility,
  doctorController.setMemberAccess
);

export default router;
