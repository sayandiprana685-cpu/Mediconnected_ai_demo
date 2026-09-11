import { env } from "../config/env.js";
import { OtpChallenge, User } from "../models/index.js";
import { AppError } from "../utils/errors.js";
import {
  clearCookieOptions,
  comparePassword,
  cookieOptions,
  generateOtp,
  hashPassword,
  randomToken,
  sha256,
  signAccessToken,
  signRefreshToken,
  verifyRefresh,
} from "../utils/crypto.js";
import { publicUser } from "../utils/helpers.js";
import { ROLES, USER_STATUS } from "../utils/constants.js";
import { sendOtpEmail, sendPasswordReset } from "./email.service.js";
import { writeAudit } from "./audit.service.js";

const ACCESS_MS = 15 * 60 * 1000;
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

function tokenPayload(user) {
  return { sub: String(user._id), role: user.role, facilityId: user.facilityId ? String(user.facilityId) : null };
}

export function setAuthCookies(res, user) {
  const access = signAccessToken(tokenPayload(user));
  const refresh = signRefreshToken(tokenPayload(user));
  res.cookie("mc_access", access, cookieOptions(ACCESS_MS));
  res.cookie("mc_refresh", refresh, cookieOptions(REFRESH_MS));
  if (env.authCookieDebug) {
    // Attribute metadata only — token values are never logged.
    console.log(
      `[auth] Set-Cookie emitted mc_access=true mc_refresh=true sameSite=${env.cookie.sameSite} secure=${env.cookie.secure} httpOnly=true domain=host-only`
    );
  }
  return { access, refresh };
}

export async function persistRefresh(user, refreshToken) {
  user.refreshTokenHash = sha256(refreshToken);
  await user.save();
}

export async function loginWithPassword(req, res, { email, password }) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const user = await User.findOne({ email: cleanEmail });
  if (!user) {
    await writeAudit(req, { action: "FAILED_LOGIN", resource: "User", metadata: { email: cleanEmail } });
    throw new AppError("Email or password is incorrect.", 401, "INVALID_CREDENTIALS");
  }
  if (user.lockUntil && user.lockUntil > new Date()) {
    throw new AppError("This account is temporarily locked after too many failed attempts. Try again later.", 423, "LOCKED");
  }
  if (user.status === USER_STATUS.SUSPENDED || user.status === USER_STATUS.DEACTIVATED) {
    throw new AppError("This account is not permitted to sign in.", 403, "ACCOUNT_DISABLED");
  }
  if (!user.passwordHash) {
    throw new AppError("This account has not finished activation. Use the invitation or OTP flow.", 400, "NO_PASSWORD");
  }
  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) {
    user.failedLogins += 1;
    if (user.failedLogins >= 6) {
      user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
    }
    await user.save();
    await writeAudit(req, { action: "FAILED_LOGIN", resource: "User", resourceId: user._id });
    throw new AppError("Email or password is incorrect.", 401, "INVALID_CREDENTIALS");
  }
  user.failedLogins = 0;
  user.lockUntil = undefined;
  user.lastLoginAt = new Date();
  const { access, refresh } = setAuthCookies(res, user);
  user.refreshTokenHash = sha256(refresh);
  await user.save();
  await writeAudit(req, { action: "LOGIN", resource: "User", resourceId: user._id, facilityId: user.facilityId });
  return { user: publicUser(user), accessToken: access, refreshToken: refresh };
}

export async function requestOtp(email, purpose = "LOGIN") {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const code = generateOtp();
  await OtpChallenge.updateMany({ email: cleanEmail, purpose, consumed: false }, { consumed: true });
  await OtpChallenge.create({
    email: cleanEmail,
    purpose,
    codeHash: sha256(code),
    expiresAt: new Date(Date.now() + env.otpMinutes * 60 * 1000),
  });
  try {
    await sendOtpEmail(cleanEmail, code, purpose);
  } catch (err) {
    // Email delivery failed — invalidate the challenge so the user is not
    // left with a valid OTP they can never receive.
    await OtpChallenge.updateMany({ email: cleanEmail, purpose, consumed: false }, { consumed: true });
    // Sanitised server-side log — no credentials or OTP value exposed.
    console.error("[otp] Failed to deliver verification email:", err.code || err.message?.slice(0, 80));
    throw new AppError(
      "Unable to send the verification email. Please try again.",
      502,
      "EMAIL_DELIVERY_FAILED"
    );
  }
  return { sent: true };
}

export async function verifyOtp(email, code, purpose = "LOGIN") {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const challenge = await OtpChallenge.findOne({
    email: cleanEmail,
    purpose,
    consumed: false,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
  if (!challenge) throw new AppError("This code is invalid or has expired.", 400, "OTP_INVALID");
  challenge.attempts += 1;
  if (challenge.attempts > 5) {
    challenge.consumed = true;
    await challenge.save();
    throw new AppError("Too many incorrect attempts. Request a new code.", 429, "OTP_LOCKED");
  }
  if (challenge.codeHash !== sha256(code)) {
    await challenge.save();
    throw new AppError("This code is invalid or has expired.", 400, "OTP_INVALID");
  }
  challenge.consumed = true;
  await challenge.save();
  return true;
}

export async function loginWithOtp(req, res, { email, code }) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  await verifyOtp(cleanEmail, code, "LOGIN");
  const user = await User.findOne({ email: cleanEmail });
  if (!user) throw new AppError("No provider account exists for this email.", 404, "NOT_FOUND");
  if (user.status === USER_STATUS.SUSPENDED || user.status === USER_STATUS.DEACTIVATED) {
    throw new AppError("This account is not permitted to sign in.", 403, "ACCOUNT_DISABLED");
  }
  user.lastLoginAt = new Date();
  const { access, refresh } = setAuthCookies(res, user);
  user.refreshTokenHash = sha256(refresh);
  await user.save();
  await writeAudit(req, { action: "LOGIN", resource: "User", resourceId: user._id, metadata: { method: "OTP" } });
  return { user: publicUser(user), accessToken: access, refreshToken: refresh };
}

export async function refreshSession(req, res) {
  const token = req.body?.refreshToken || req.cookies?.mc_refresh;
  if (!token) throw new AppError("Your session has expired. Please sign in again.", 401, "SESSION_EXPIRED");
  let decoded;
  try {
    decoded = verifyRefresh(token);
  } catch {
    throw new AppError("Your session has expired. Please sign in again.", 401, "SESSION_EXPIRED");
  }
  const user = await User.findById(decoded.sub);
  if (!user || user.refreshTokenHash !== sha256(token)) {
    throw new AppError("Your session has expired. Please sign in again.", 401, "SESSION_EXPIRED");
  }
  const { access, refresh } = setAuthCookies(res, user);
  user.refreshTokenHash = sha256(refresh);
  await user.save();
  return { user: publicUser(user), accessToken: access, refreshToken: refresh };
}

export async function logout(req, res) {
  if (req.user) {
    await User.findByIdAndUpdate(req.user._id, { $unset: { refreshTokenHash: 1 } });
    await writeAudit(req, { action: "LOGOUT", resource: "User", resourceId: req.user._id });
  }
  res.clearCookie("mc_access", clearCookieOptions());
  res.clearCookie("mc_refresh", clearCookieOptions());
}

export async function requestPasswordReset(email) {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return { sent: true };
  const token = randomToken();
  user.passwordResetHash = sha256(token);
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();
  const link = `${env.clientUrl}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;
  await sendPasswordReset(user.email, link);
  return { sent: true };
}

export async function resetPassword({ email, token, password }) {
  const user = await User.findOne({
    email: email.toLowerCase(),
    passwordResetExpires: { $gt: new Date() },
  });
  if (!user || user.passwordResetHash !== sha256(token)) {
    throw new AppError("This reset link is invalid or has expired.", 400, "RESET_INVALID");
  }
  user.passwordHash = await hashPassword(password);
  user.passwordResetHash = undefined;
  user.passwordResetExpires = undefined;
  user.failedLogins = 0;
  user.lockUntil = undefined;
  await user.save();
  return { ok: true };
}

export { ROLES, publicUser };
