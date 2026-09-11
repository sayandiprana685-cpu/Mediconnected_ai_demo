import { DoctorProfile, Facility, FacilityDoctor, Schedule, User, getNetworkSettings } from "../models/index.js";
import { AppError, asyncHandler } from "../utils/errors.js";
import { assertDisplayName, assertValidPhone, publicUser, resolveTodayActive } from "../utils/helpers.js";
import { writeAudit } from "../services/audit.service.js";
import { notifyUser } from "../services/notify.service.js";
import { comparePassword, hashPassword, sha256, signRefreshToken } from "../utils/crypto.js";
import { cookieOptions } from "../utils/crypto.js";
import { requestOtp, setAuthCookies, verifyOtp } from "../services/auth.service.js";
import { ROLES } from "../utils/constants.js";
import { env } from "../config/env.js";

const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"];
const TIME_FORMATS = ["12h", "24h"];
const LANGUAGES = ["en", "hi", "mr"];

function passwordOk(password) {
  return typeof password === "string" && password.length >= 8;
}

async function requireCurrentPassword(user, currentPassword) {
  if (!currentPassword) throw new AppError("Current password is required.", 422, "PASSWORD_REQUIRED");
  if (!user.passwordHash) throw new AppError("This account has no password set.", 400, "NO_PASSWORD");
  const ok = await comparePassword(currentPassword, user.passwordHash);
  if (!ok) throw new AppError("Current password is incorrect.", 401, "INVALID_CREDENTIALS");
}

export const settingsController = {
  get: asyncHandler(async (req, res) => {
    const user = publicUser(req.user);
    let doctorProfile = null;
    let todayActive = null;
    let schedule = null;
    let facility = null;
    if (req.user.role === ROLES.DOCTOR) {
      doctorProfile = await DoctorProfile.findOne({ userId: req.user._id });
      if (req.facilityId) {
        const link = await FacilityDoctor.findOne({ userId: req.user._id, facilityId: req.facilityId });
        todayActive = resolveTodayActive(link, doctorProfile);
        schedule = await Schedule.findOne({ doctorUserId: req.user._id, facilityId: req.facilityId });
      }
    }
    if (req.user.role === ROLES.FACILITY_ADMIN && req.user.facilityId) {
      facility = await Facility.findById(req.user.facilityId);
    }
    const network = req.user.role === ROLES.MAIN_ADMIN ? await getNetworkSettings() : null;
    res.json({
      user,
      doctorProfile,
      todayActive,
      schedule,
      facility,
      network: network ? { name: network.name } : undefined,
      session: {
        lastLoginAt: req.user.lastLoginAt,
        createdAt: req.user.createdAt,
        role: req.user.role,
      },
      system:
        req.user.role === ROLES.MAIN_ADMIN
          ? { timezone: env.appTz, clientUrl: env.clientUrl, node: env.node }
          : undefined,
    });
  }),

  updateProfile: asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (b.role != null || b.status != null || b.facilityId !== undefined || b.credentialsVerified !== undefined) {
      throw new AppError("You cannot change role, account status, or verification from settings.", 403, "FORBIDDEN");
    }
    const user = req.user;
    const before = { name: user.name };
    if (b.name != null) {
      const name = String(b.name).trim();
      if (name.length < 2) throw new AppError("Enter your full name.", 422, "NAME_INVALID");
      user.name = name;
    }
    if (b.photoUrl !== undefined) user.photoUrl = String(b.photoUrl || "").trim();
    if (b.preferredLanguage != null) {
      if (!LANGUAGES.includes(b.preferredLanguage)) throw new AppError("Unsupported language.", 422, "LANGUAGE_INVALID");
      user.preferredLanguage = b.preferredLanguage;
    }
    if (b.timezone != null) {
      const tz = String(b.timezone).trim();
      if (!tz) throw new AppError("Enter a time zone.", 422, "TZ_INVALID");
      user.timezone = tz;
    }
    if (b.dateFormat != null) {
      if (!DATE_FORMATS.includes(b.dateFormat)) throw new AppError("Unsupported date format.", 422, "DATE_FORMAT_INVALID");
      user.dateFormat = b.dateFormat;
    }
    if (b.timeFormat != null) {
      if (!TIME_FORMATS.includes(b.timeFormat)) throw new AppError("Unsupported time format.", 422, "TIME_FORMAT_INVALID");
      user.timeFormat = b.timeFormat;
    }
    await user.save();
    await writeAudit(req, {
      action: "PROFILE_UPDATE",
      resource: "User",
      resourceId: user._id,
      metadata: { fields: Object.keys(b).filter((k) => b[k] !== undefined) },
    });
    if (before.name !== user.name) {
      await notifyUser(user, {
        title: "Profile updated",
        body: "Your display name was changed.",
        kind: "SYSTEM",
        channel: "system",
      });
    }
    res.json({ user: publicUser(user), message: "Settings saved successfully." });
  }),

  requestEmailChange: asyncHandler(async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError("Enter a valid email address.", 422, "EMAIL_INVALID");
    }
    await requireCurrentPassword(req.user, req.body.currentPassword);
    if (email === req.user.email) throw new AppError("That is already your email address.", 422, "EMAIL_UNCHANGED");
    const taken = await User.findOne({ email, _id: { $ne: req.user._id } });
    if (taken) throw new AppError("This email is already used by another account.", 409, "EMAIL_TAKEN");
    req.user.pendingEmail = email;
    await req.user.save();
    await requestOtp(email, "EMAIL_CHANGE");
    await writeAudit(req, { action: "EMAIL_CHANGE", resource: "User", resourceId: req.user._id, metadata: { stage: "requested" } });
    res.json({ message: "A verification code was sent to the new email address.", pendingEmail: email });
  }),

  confirmEmailChange: asyncHandler(async (req, res) => {
    const email = String(req.body.email || req.user.pendingEmail || "").trim().toLowerCase();
    if (!email || email !== req.user.pendingEmail) {
      throw new AppError("Request an email change first.", 400, "EMAIL_CHANGE_PENDING");
    }
    await verifyOtp(email, req.body.code, "EMAIL_CHANGE");
    const taken = await User.findOne({ email, _id: { $ne: req.user._id } });
    if (taken) throw new AppError("This email is already used by another account.", 409, "EMAIL_TAKEN");
    req.user.email = email;
    req.user.pendingEmail = undefined;
    await req.user.save();
    await writeAudit(req, { action: "EMAIL_CHANGE", resource: "User", resourceId: req.user._id, metadata: { stage: "confirmed" } });
    await notifyUser(req.user, {
      title: "Email address updated",
      body: "Your sign-in email was changed.",
      kind: "SYSTEM",
      channel: "system",
    });
    res.json({ user: publicUser(req.user), message: "Settings saved successfully." });
  }),

  updatePhone: asyncHandler(async (req, res) => {
    await requireCurrentPassword(req.user, req.body.currentPassword);
    const phone = assertValidPhone(req.body.phone);
    if (phone) {
      const taken = await User.findOne({ phone, _id: { $ne: req.user._id } });
      if (taken) throw new AppError("This phone number is already used by another account.", 409, "PHONE_TAKEN");
    }
    req.user.phone = phone || undefined;
    await req.user.save();
    await writeAudit(req, { action: "PHONE_CHANGE", resource: "User", resourceId: req.user._id });
    res.json({ user: publicUser(req.user), message: "Settings saved successfully." });
  }),

  changePassword: asyncHandler(async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    await requireCurrentPassword(req.user, currentPassword);
    if (!passwordOk(newPassword)) throw new AppError("New password must be at least 8 characters.", 422, "PASSWORD_WEAK");
    if (newPassword !== confirmPassword) throw new AppError("New password and confirmation do not match.", 422, "PASSWORD_MISMATCH");
    if (await comparePassword(newPassword, req.user.passwordHash)) {
      throw new AppError("Choose a password that is different from your current password.", 422, "PASSWORD_SAME");
    }
    req.user.passwordHash = await hashPassword(newPassword);
    req.user.failedLogins = 0;
    req.user.lockUntil = undefined;
    const { access, refresh } = setAuthCookies(res, req.user);
    req.user.refreshTokenHash = sha256(refresh);
    await req.user.save();
    await writeAudit(req, { action: "PASSWORD_CHANGE", resource: "User", resourceId: req.user._id });
    await notifyUser(req.user, {
      title: "Password changed",
      body: "Your password was updated. Other sessions were signed out.",
      kind: "SYSTEM",
      channel: "system",
    });
    res.json({ user: publicUser(req.user), message: "Settings saved successfully." });
  }),

  updateNotifications: asyncHandler(async (req, res) => {
    const allowed = ["appointments", "referrals", "followUps", "system", "email", "inApp"];
    const patch = {};
    for (const k of allowed) {
      if (typeof req.body[k] === "boolean") patch[k] = req.body[k];
    }
    if (!Object.keys(patch).length) throw new AppError("No notification preferences provided.", 422, "EMPTY");
    req.user.notificationPrefs = { ...prefsSnapshot(req.user), ...patch };
    await req.user.save();
    await writeAudit(req, {
      action: "NOTIFICATION_SETTINGS_UPDATE",
      resource: "User",
      resourceId: req.user._id,
      metadata: { fields: Object.keys(patch) },
    });
    res.json({ user: publicUser(req.user), message: "Settings saved successfully." });
  }),

  updateNetwork: asyncHandler(async (req, res) => {
    if (req.user.role !== ROLES.MAIN_ADMIN) {
      throw new AppError("You are not authorised to update network settings.", 403, "FORBIDDEN");
    }
    const name = assertDisplayName(req.body.name, "Network name");
    const network = await getNetworkSettings();
    network.name = name;
    await network.save();
    await writeAudit(req, { action: "NETWORK_UPDATE", resource: "NetworkSettings", resourceId: network._id, metadata: { name } });
    res.json({ network: { name: network.name }, message: "Settings saved successfully." });
  }),
};

function prefsSnapshot(user) {
  const p = user.notificationPrefs?.toObject?.() || user.notificationPrefs || {};
  return {
    appointments: p.appointments !== false,
    referrals: p.referrals !== false,
    followUps: p.followUps !== false,
    system: p.system !== false,
    email: p.email !== false,
    inApp: p.inApp !== false,
  };
}
