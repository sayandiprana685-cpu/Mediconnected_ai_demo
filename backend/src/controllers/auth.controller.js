import { z } from "zod";
import { authenticate } from "../middleware/authenticate.js";
import { User, FacilityDoctor, DoctorProfile, Facility, getNetworkSettings } from "../models/index.js";
import {
  loginWithOtp,
  loginWithPassword,
  logout,
  refreshSession,
  requestOtp,
  requestPasswordReset,
  resetPassword,
} from "../services/auth.service.js";
import { asyncHandler } from "../utils/errors.js";
import { publicUser } from "../utils/helpers.js";
import { isFacilityScopedRole, ROLES } from "../utils/constants.js";

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
  }),
});

export const authController = {
  login: asyncHandler(async (req, res) => {
    const data = await loginWithPassword(req, res, req.body);
    res.json(data);
  }),
  requestOtp: asyncHandler(async (req, res) => {
    const raw = req.body?.email;
    // Validate email format before attempting to send.
    const parsed = z.string().email().safeParse(String(raw || "").toLowerCase().trim());
    if (!parsed.success) {
      return res.status(422).json({ error: "A valid email address is required.", code: "EMAIL_INVALID" });
    }
    await requestOtp(parsed.data, "LOGIN");
    res.json({ message: "If an account exists, a verification code was sent." });
  }),
  loginOtp: asyncHandler(async (req, res) => {
    const data = await loginWithOtp(req, res, req.body);
    res.json(data);
  }),
  refresh: asyncHandler(async (req, res) => {
    const data = await refreshSession(req, res);
    res.json(data);
  }),
  logout: asyncHandler(async (req, res) => {
    await logout(req, res);
    res.json({ ok: true });
  }),
  me: asyncHandler(async (req, res) => {
    const user = publicUser(req.user);
    let facilities = [];
    let doctorProfile = null;
    if (req.user.role === ROLES.DOCTOR) {
      const links = await FacilityDoctor.find({ userId: req.user._id, status: "ACTIVE" }).populate(
        "facilityId",
        "name type city status"
      );
      facilities = links.map((l) => l.facilityId).filter(Boolean);
      doctorProfile = await DoctorProfile.findOne({ userId: req.user._id });
    } else if (isFacilityScopedRole(req.user.role) && req.user.facilityId) {
      const f = await Facility.findById(req.user.facilityId).select("name type city district state pin status");
      facilities = f ? [f] : [];
    }
    const network = req.user.role === ROLES.MAIN_ADMIN ? await getNetworkSettings() : null;
    res.json({ user, facilities, doctorProfile, network: network ? { name: network.name } : null });
  }),
  forgot: asyncHandler(async (req, res) => {
    await requestPasswordReset(req.body.email);
    res.json({ message: "If an account exists, a reset link was sent." });
  }),
  reset: asyncHandler(async (req, res) => {
    await resetPassword(req.body);
    res.json({ message: "Password updated. You may sign in." });
  }),
};

export { authenticate };
