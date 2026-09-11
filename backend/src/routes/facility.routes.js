import { Router } from "express";
import { facilityController } from "../controllers/facility.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authenticate.js";
import { resolveFacilityContext, requireFacility } from "../middleware/authorize.js";
import { ROLES } from "../utils/constants.js";

const router = Router();
router.post("/register", facilityController.register);
router.get("/me", authenticate, resolveFacilityContext, requireFacility, facilityController.mine);
router.patch("/me", authenticate, authorize(ROLES.FACILITY_ADMIN), resolveFacilityContext, requireFacility, facilityController.updateMine);
router.post("/me/departments", authenticate, authorize(ROLES.FACILITY_ADMIN), resolveFacilityContext, requireFacility, facilityController.addDepartment);
router.post("/me/services", authenticate, authorize(ROLES.FACILITY_ADMIN), resolveFacilityContext, requireFacility, facilityController.addService);

export default router;
