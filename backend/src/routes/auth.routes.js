import { Router } from "express";
import { z } from "zod";
import { authController } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authLimiter, otpRequestLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
  }),
});

const router = Router();
router.post("/login", authLimiter, validate(loginSchema), authController.login);
router.post("/otp/request", otpRequestLimiter, authController.requestOtp);
router.post("/otp/login", authLimiter, authController.loginOtp);
router.post("/refresh", authController.refresh);
router.post("/logout", authenticate, authController.logout);
router.get("/me", authenticate, authController.me);
router.post("/forgot-password", otpRequestLimiter, authController.forgot);
router.post("/reset-password", authLimiter, authController.reset);

export default router;
