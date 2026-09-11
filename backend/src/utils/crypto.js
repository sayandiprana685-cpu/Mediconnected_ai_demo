import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function hashPassword(plain) {
  return bcrypt.hash(plain, env.bcryptRounds);
}

export function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}

export function signAccessToken(payload) {
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: env.jwtAccessExpires });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshExpires });
}

export function verifyAccess(token) {
  return jwt.verify(token, env.jwtAccessSecret);
}

export function verifyRefresh(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}

// No `domain` is set on purpose: these stay host-only cookies scoped to the
// backend origin rather than being widened across the deployment.
function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: env.cookie.sameSite,
    secure: env.cookie.secure,
    path: "/",
  };
}

export function cookieOptions(maxAgeMs) {
  return {
    ...baseCookieOptions(),
    maxAge: maxAgeMs,
  };
}

// Must mirror the attributes the cookie was issued with — a browser only
// deletes a cookie when path, domain, secure and sameSite all match.
export function clearCookieOptions() {
  return baseCookieOptions();
}
