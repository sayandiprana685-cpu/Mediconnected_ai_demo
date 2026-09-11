import { Router } from "express";
import { analyticsController } from "../controllers/analytics.controller.js";
import { authenticate, authorize } from "../middleware/authenticate.js";
import { resolveFacilityContext, requireFacility } from "../middleware/authorize.js";
import { ROLES } from "../utils/constants.js";

const router = Router();
router.get("/doctor", authenticate, authorize(ROLES.DOCTOR), resolveFacilityContext, requireFacility, analyticsController.doctorDashboard);
router.get("/facility", authenticate, authorize(ROLES.FACILITY_ADMIN), resolveFacilityContext, requireFacility, analyticsController.facilityDashboard);
router.get("/government", authenticate, authorize(ROLES.MAIN_ADMIN), analyticsController.governmentDashboard);

export default router;
