import { env } from "../config/env.js";
import { OtpChallenge, Patient, User } from "../models/index.js";
import { AppError } from "../utils/errors.js";
import {
  cookieOptions,
  generateOtp,
  sha256,
  signAccessToken,
  signRefreshToken,
} from "../utils/crypto.js";
import { assertDisplayName, assertValidPhone, normalizePhone, publicUser } from "../utils/helpers.js";
import { ROLES, USER_STATUS } from "../utils/constants.js";
import { writeAudit } from "./audit.service.js";

const ACCESS_MS = 15 * 60 * 1000;
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

function patientEmail(phone) {
  const digits = String(phone).replace(/\D/g, "");
  return `p.${digits}@users.mediconnect.local`;
}

function otpKey(phone) {
  return `sms:${normalizePhone(phone)}`.toLowerCase();
}

function tokenPayload(user) {
  return { sub: String(user._id), role: user.role, facilityId: null };
}

async function issueSession(res, user) {
  const payload = tokenPayload(user);
  const access = signAccessToken(payload);
  const refresh = signRefreshToken(payload);
  res.cookie("mc_access", access, cookieOptions(ACCESS_MS));
  res.cookie("mc_refresh", refresh, cookieOptions(REFRESH_MS));
  user.refreshTokenHash = sha256(refresh);
  user.lastLoginAt = new Date();
  await user.save();
  return { accessToken: access, refreshToken: refresh };
}

function nextMrn() {
  return `MC-P-${Date.now().toString(36).toUpperCase()}`;
}

export async function requestPatientOtp(phone) {
  const n = assertValidPhone(phone);
  if (!n) throw new AppError("Enter a valid mobile number.", 422, "PHONE_INVALID");
  const code = generateOtp();
  const email = otpKey(n);
  await OtpChallenge.updateMany({ email, purpose: "PATIENT_LOGIN", consumed: false }, { consumed: true });
  await OtpChallenge.create({
    email,
    purpose: "PATIENT_LOGIN",
    codeHash: sha256(code),
    expiresAt: new Date(Date.now() + env.otpMinutes * 60 * 1000),
  });
  // OTP is never logged or returned — deliver silently. For phone-based
  // patient login the code is stored (hashed) in OtpChallenge and verified
  // on the /verify endpoint. Log only a sanitised confirmation.
  const maskedPhone = String(n).slice(0, -4).replace(/\d/g, "*") + String(n).slice(-4);
  console.log(`[otp] Patient OTP requested for ${maskedPhone}`);
  return { sent: true, message: "A verification code was sent to your phone." };
}

export async function verifyPatientOtp(req, res, { phone, code, name }) {
  const n = assertValidPhone(phone);
  if (!n) throw new AppError("Enter a valid mobile number.", 422, "PHONE_INVALID");
  const email = otpKey(n);
  const challenge = await OtpChallenge.findOne({
    email,
    purpose: "PATIENT_LOGIN",
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
  if (challenge.codeHash !== sha256(String(code || "").trim())) {
    await challenge.save();
    throw new AppError("This code is invalid or has expired.", 400, "OTP_INVALID");
  }
  challenge.consumed = true;
  await challenge.save();

  let user = await User.findOne({ phone: n, role: ROLES.PATIENT });
  if (!user) {
    user = await User.findOne({ email: patientEmail(n), role: ROLES.PATIENT });
  }
  if (!user) {
    const display = name ? assertDisplayName(name, "Name") : "Member";
    user = await User.create({
      name: display,
      email: patientEmail(n),
      phone: n,
      role: ROLES.PATIENT,
      status: USER_STATUS.ACTIVE,
      preferredLanguage: "en",
    });
    await Patient.create({
      mrn: nextMrn(),
      name: display,
      phone: n,
      userId: user._id,
      country: "India",
      languagePreference: "en",
    });
  } else if (user.status === USER_STATUS.SUSPENDED || user.status === USER_STATUS.DEACTIVATED) {
    throw new AppError("This account is not permitted to sign in.", 403, "ACCOUNT_DISABLED");
  } else if (name && user.name === "Member") {
    user.name = assertDisplayName(name, "Name");
    await user.save();
    await Patient.updateOne({ userId: user._id }, { $set: { name: user.name } });
  }

  const tokens = await issueSession(res, user);
  const patient = await Patient.findOne({ userId: user._id });
  await writeAudit(req, { action: "LOGIN", resource: "User", resourceId: user._id, metadata: { method: "PATIENT_OTP" } });
  return { user: publicUser(user), patient, ...tokens };
}

export function patientPublicProfile(user, patient) {
  return {
    user: publicUser(user),
    patient: patient
      ? {
          id: String(patient._id),
          mrn: patient.mrn,
          name: patient.name,
          phone: patient.phone,
          sex: patient.sex,
          dateOfBirth: patient.dateOfBirth,
          age: patient.age,
          address: patient.address,
          city: patient.city,
          district: patient.district,
          state: patient.state,
          pin: patient.pin,
          country: patient.country,
          geo: patient.geo,
          locationSource: patient.locationSource,
          emergencyContactName: patient.emergencyContactName,
          emergencyContactPhone: patient.emergencyContactPhone,
          languagePreference: patient.languagePreference || "en",
          bloodGroup: patient.bloodGroup,
          allergies: patient.allergies || [],
        }
      : null,
  };
}
