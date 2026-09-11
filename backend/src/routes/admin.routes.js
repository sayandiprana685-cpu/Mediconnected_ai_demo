import { Router } from "express";
import { adminController } from "../controllers/admin.controller.js";
import { authenticate, authorize } from "../middleware/authenticate.js";
import { ROLES } from "../utils/constants.js";

const router = Router();
router.use(authenticate, authorize(ROLES.MAIN_ADMIN));
router.get("/facilities", adminController.facilities);
router.get("/facilities/:id", adminController.facilityOne);
router.get("/verifications", adminController.verifications);
router.post("/facilities/:id/decision", adminController.verify);
router.get("/doctors", adminController.doctors);
router.post("/users/:id/status", adminController.suspendUser);
router.get("/audit", adminController.audit);
router.get("/medicine-orders", adminController.medicineOrders);
router.get("/medicine-orders/:id", adminController.medicineOrderOne);

export default router;
