import { Router } from "express";
import { pharmacyController } from "../controllers/pharmacy.controller.js";
import { procurementController } from "../controllers/procurement.controller.js";
import { authenticate, authorize } from "../middleware/authenticate.js";
import {
  requireFacility,
  requirePharmacyFacility,
  requireVerifiedFacility,
  resolveFacilityContext,
} from "../middleware/authorize.js";
import { PHARMACY_ROLES, ROLES } from "../utils/constants.js";

const scoped = [authenticate, authorize(...PHARMACY_ROLES), resolveFacilityContext, requireFacility, requirePharmacyFacility];
const ops = [...scoped, requireVerifiedFacility];

const router = Router();
router.get("/dashboard", ...scoped, pharmacyController.dashboard);
router.get("/medicines", ...scoped, pharmacyController.listMedicines);
router.post("/medicines", ...scoped, authorize(ROLES.FACILITY_ADMIN, ROLES.PHARMACIST), pharmacyController.createMedicine);
router.patch("/medicines/:id", ...scoped, authorize(ROLES.FACILITY_ADMIN, ROLES.PHARMACIST), pharmacyController.updateMedicine);
router.post("/medicines/:id/stock", ...scoped, authorize(ROLES.FACILITY_ADMIN, ROLES.PHARMACIST, ROLES.PHARMACY_STAFF), pharmacyController.adjustStock);
router.get("/orders", ...ops, pharmacyController.listOrders);
router.get("/orders/:id", ...ops, pharmacyController.orderOne);
router.patch("/orders/:id/status", ...ops, pharmacyController.updateStatus);
router.post("/orders/:id/dispense", ...ops, authorize(ROLES.FACILITY_ADMIN, ROLES.PHARMACIST), pharmacyController.dispense);
router.get("/procurement", ...ops, procurementController.pharmacyList);
router.get("/procurement/:id", ...ops, procurementController.pharmacyOne);
router.post("/procurement/:id/respond", ...ops, procurementController.pharmacyRespond);
router.patch("/procurement/:id/status", ...ops, procurementController.pharmacyAdvance);
router.get("/patient-orders", ...ops, pharmacyController.listPatientAppOrders);
router.get("/patient-orders/:id", ...ops, pharmacyController.patientAppOrderOne);
router.patch("/patient-orders/:id/status", ...ops, pharmacyController.advancePatientAppOrder);

export default router;
