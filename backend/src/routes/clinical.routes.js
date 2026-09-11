import { Router } from "express";
import { clinicalController } from "../controllers/clinical.controller.js";
import { authenticate, authorize } from "../middleware/authenticate.js";
import { resolveFacilityContext, requireFacility } from "../middleware/authorize.js";
import { ROLES } from "../utils/constants.js";
import { pharmacyController } from "../controllers/pharmacy.controller.js";

const provider = [authenticate, authorize(ROLES.DOCTOR, ROLES.FACILITY_ADMIN, ROLES.LAB_TECH, ROLES.LAB_REVIEWER, ROLES.PHARMACIST, ROLES.PHARMACY_STAFF), resolveFacilityContext, requireFacility];
const clinicalProvider = [authenticate, authorize(ROLES.DOCTOR, ROLES.FACILITY_ADMIN), resolveFacilityContext, requireFacility];
const doctorOnly = [authenticate, authorize(ROLES.DOCTOR), resolveFacilityContext, requireFacility];

const router = Router();

router.get("/patients", ...provider, clinicalController.patients);
router.post("/patients", ...provider, clinicalController.createPatient);
router.get("/patients/:id", ...provider, clinicalController.patientOne);

router.get("/appointments", ...clinicalProvider, clinicalController.appointments);
router.post("/appointments", ...clinicalProvider, clinicalController.createAppointment);
router.patch("/appointments/:id", ...clinicalProvider, clinicalController.updateAppointment);
router.post("/appointments/:id/complete", ...doctorOnly, clinicalController.completeAppointment);
router.post("/appointments/:id/check-in", ...clinicalProvider, clinicalController.checkIn);

router.get("/queue", ...clinicalProvider, clinicalController.queue);
router.patch("/queue/:id", ...clinicalProvider, clinicalController.updateQueue);

router.get("/consultations", ...doctorOnly, clinicalController.consultations);
router.post("/consultations", ...doctorOnly, clinicalController.startConsultation);
router.patch("/consultations/:id", ...doctorOnly, clinicalController.saveConsultation);

router.get("/prescriptions", ...clinicalProvider, clinicalController.prescriptions);
router.get("/prescriptions/letterhead", ...doctorOnly, clinicalController.prescriptionLetterhead);
router.post("/prescriptions", ...doctorOnly, clinicalController.createPrescription);
router.get("/prescriptions/:id/pdf", ...clinicalProvider, clinicalController.prescriptionPdf);
router.get("/prescriptions/:id", ...clinicalProvider, clinicalController.prescriptionOne);
router.patch("/prescriptions/:id", ...clinicalProvider, clinicalController.updatePrescription);
router.post("/prescriptions/:id/finalize", ...doctorOnly, clinicalController.finalizePrescription);
router.post("/prescriptions/:id/revise", ...doctorOnly, clinicalController.revisePrescription);
router.post("/prescriptions/:id/send-pharmacy", ...clinicalProvider, pharmacyController.sendFromDoctor);

router.get("/referrals", authenticate, resolveFacilityContext, clinicalController.referrals);
router.post("/referrals", ...doctorOnly, clinicalController.createReferral);
router.patch("/referrals/:id", authenticate, resolveFacilityContext, clinicalController.updateReferral);

router.get("/follow-ups", ...clinicalProvider, clinicalController.followUps);
router.patch("/follow-ups/:id", ...clinicalProvider, clinicalController.updateFollowUp);

export default router;
