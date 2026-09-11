import { Router } from "express";
import { settingsController } from "../controllers/settings.controller.js";
import { authenticate, authorize } from "../middleware/authenticate.js";
import { resolveFacilityContext } from "../middleware/authorize.js";
import { ROLES } from "../utils/constants.js";

const router = Router();
router.use(authenticate, resolveFacilityContext);
router.get("/", settingsController.get);
router.patch("/profile", settingsController.updateProfile);
router.post("/email/request", settingsController.requestEmailChange);
router.post("/email/confirm", settingsController.confirmEmailChange);
router.patch("/phone", settingsController.updatePhone);
router.post("/password", settingsController.changePassword);
router.patch("/notifications", settingsController.updateNotifications);
router.patch("/network", authorize(ROLES.MAIN_ADMIN), settingsController.updateNetwork);

export default router;
