import { Router } from "express";
import { diagnosticController } from "../controllers/diagnostic.controller.js";
import { authenticate, authorize } from "../middleware/authenticate.js";
import {
  requireDiagnosticFacility,
  requireFacility,
  requireVerifiedFacility,
  resolveFacilityContext,
} from "../middleware/authorize.js";
import { DIAGNOSTIC_ROLES, ROLES } from "../utils/constants.js";

const scoped = [authenticate, authorize(...DIAGNOSTIC_ROLES), resolveFacilityContext, requireFacility, requireDiagnosticFacility];
const ops = [...scoped, requireVerifiedFacility];

const router = Router();
router.get("/dashboard", ...scoped, diagnosticController.dashboard);
router.get("/tests", ...scoped, diagnosticController.listTests);
router.post("/tests", ...scoped, authorize(ROLES.FACILITY_ADMIN), diagnosticController.createTest);
router.patch("/tests/:id", ...scoped, authorize(ROLES.FACILITY_ADMIN), diagnosticController.updateTest);
router.get("/orders", ...ops, diagnosticController.listOrders);
router.post("/orders", ...ops, diagnosticController.createOrder);
router.get("/orders/:id", ...ops, diagnosticController.orderOne);
router.patch("/orders/:id/status", ...ops, diagnosticController.updateStatus);
router.patch("/orders/:id/results", ...ops, diagnosticController.saveResults);
router.get("/orders/:id/pdf", ...ops, diagnosticController.reportPdf);

export default router;
