import { Router } from "express";
import { User, Notification, Facility } from "../models/index.js";
import { authenticate, authorize } from "../middleware/authenticate.js";
import { resolveFacilityContext, requireFacility } from "../middleware/authorize.js";
import { FACILITY_SCOPED_ROLES, ROLES } from "../utils/constants.js";
import { AppError, asyncHandler } from "../utils/errors.js";
import { hashPassword } from "../utils/crypto.js";
import { writeAudit } from "../services/audit.service.js";
import { listOutboundEmails } from "../utils/emailOutbox.js";
import { env } from "../config/env.js";

const router = Router();

router.get(
  "/staff",
  authenticate,
  authorize(ROLES.FACILITY_ADMIN),
  resolveFacilityContext,
  requireFacility,
  asyncHandler(async (req, res) => {
    const staff = await User.find({ facilityId: req.facilityId, role: { $in: FACILITY_SCOPED_ROLES } }).select(
      "name email phone status role createdAt"
    );
    res.json({ staff });
  })
);

router.post(
  "/staff",
  authenticate,
  authorize(ROLES.FACILITY_ADMIN),
  resolveFacilityContext,
  requireFacility,
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const role = b.role || ROLES.FACILITY_ADMIN;
    if (!FACILITY_SCOPED_ROLES.includes(role)) {
      throw new AppError("Invalid staff role.", 422, "ROLE_INVALID");
    }
    const email = String(b.email || "").toLowerCase();
    if (!email || !b.name || !b.password || String(b.password).length < 8) {
      throw new AppError("Name, email, and a password of at least 8 characters are required.", 422, "INVALID");
    }
    if (await User.findOne({ email })) throw new AppError("An account already uses this email.", 409, "DUPLICATE");
    const user = await User.create({
      name: b.name,
      email,
      phone: b.phone,
      passwordHash: await hashPassword(b.password),
      role,
      status: "ACTIVE",
      facilityId: req.facilityId,
    });
    await writeAudit(req, { action: "STAFF_CREATE", resource: "User", resourceId: user._id, facilityId: req.facilityId, metadata: { role } });
    res.status(201).json({ staff: { _id: user._id, name: user.name, email: user.email, role: user.role, status: user.status } });
  })
);

router.get(
  "/notifications",
  authenticate,
  asyncHandler(async (req, res) => {
    const items = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(30);
    res.json({ notifications: items });
  })
);

router.get(
  "/network/facilities",
  authenticate,
  asyncHandler(async (req, res) => {
    const facilities = await Facility.find({ status: "VERIFIED" }).select("name type city district");
    res.json({ facilities });
  })
);

router.get(
  "/dev/outbox",
  asyncHandler(async (req, res) => {
    if (env.isProd) return res.status(404).json({ error: "Not found" });
    res.json({ emails: listOutboundEmails() });
  })
);

export default router;
