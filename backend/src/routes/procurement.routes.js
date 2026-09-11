import { Router } from "express";
import { procurementController } from "../controllers/procurement.controller.js";
import { authenticate, authorize } from "../middleware/authenticate.js";
import {
  requireBuyerFacility,
  requireFacility,
  resolveFacilityContext,
} from "../middleware/authorize.js";
import { BUYER_ROLES } from "../utils/constants.js";

const scoped = [authenticate, authorize(...BUYER_ROLES), resolveFacilityContext, requireFacility, requireBuyerFacility];

const router = Router();
router.get("/medicines", ...scoped, procurementController.searchMedicines);
router.post("/pharmacies", ...scoped, procurementController.findPharmacies);
router.post("/pharmacies/:pharmacyId", ...scoped, procurementController.pharmacyPublic);
router.post("/requests", ...scoped, procurementController.send);
router.get("/requests", ...scoped, procurementController.listMine);
router.get("/requests/:id", ...scoped, procurementController.oneMine);
router.post("/requests/:id/cancel", ...scoped, procurementController.cancelMine);
router.post("/requests/:id/cancel-outstanding", ...scoped, procurementController.cancelOutstanding);
router.post("/requests/:id/quote/accept", ...scoped, procurementController.acceptQuote);
router.post("/requests/:id/quote/reject", ...scoped, procurementController.rejectQuote);
router.post("/requests/:id/confirm", ...scoped, procurementController.confirmOrder);
router.post("/area-request", ...scoped, procurementController.requestPharmacyArea);

export default router;
