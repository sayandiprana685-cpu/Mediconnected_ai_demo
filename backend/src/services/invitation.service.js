import { env } from "../config/env.js";
import {
  DoctorProfile,
  Facility,
  FacilityDoctor,
  Invitation,
  User,
} from "../models/index.js";
import { FACILITY_STATUS, INVITE_STATUS, ROLES, USER_STATUS } from "../utils/constants.js";
import { AppError } from "../utils/errors.js";
import { hashPassword, randomToken, sha256 } from "../utils/crypto.js";
import { sendDoctorInvitation } from "./email.service.js";
import { writeAudit } from "./audit.service.js";
import { verifyOtp } from "./auth.service.js";
import { notifyUser } from "./notify.service.js";

export async function createInvitation(req, payload) {
  const facility = await Facility.findById(req.facilityId);
  if (!facility || facility.status !== FACILITY_STATUS.VERIFIED) {
    throw new AppError("Only verified facilities can invite doctors.", 403, "FACILITY_NOT_VERIFIED");
  }
  const email = payload.email.toLowerCase();
  const existingInvite = await Invitation.findOne({
    facilityId: facility._id,
    email,
    status: { $in: [INVITE_STATUS.SENT, INVITE_STATUS.OPENED] },
    expiresAt: { $gt: new Date() },
  });
  if (existingInvite) {
    throw new AppError("An active invitation already exists for this email.", 409, "INVITE_EXISTS");
  }

  const existingUser = await User.findOne({ email });
  const token = randomToken();
  const invite = await Invitation.create({
    facilityId: facility._id,
    invitedBy: req.user._id,
    email,
    phone: payload.phone,
    name: payload.name,
    registrationNumber: payload.registrationNumber,
    specialization: payload.specialization,
    qualification: payload.qualification,
    departmentId: payload.departmentId,
    experienceYears: payload.experienceYears,
    consultationSchedule: payload.consultationSchedule,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + env.inviteHours * 60 * 60 * 1000),
    existingUserId: existingUser?._id,
  });

  const link = `${env.clientUrl}/invite/${token}`;
  await sendDoctorInvitation({
    to: email,
    facilityName: facility.name,
    doctorName: payload.name,
    link,
    expiresHours: env.inviteHours,
  });
  await writeAudit(req, {
    action: "DOCTOR_INVITE",
    resource: "Invitation",
    resourceId: invite._id,
    facilityId: facility._id,
    metadata: { email },
  });
  await notifyUser(req.user, {
    title: "Doctor invitation sent",
    body: `${payload.name} was invited to ${facility.name}.`,
    kind: "INVITE",
    channel: "system",
  });
  return { invite, demoLink: env.isProd ? undefined : link };
}

export async function openInvitation(token) {
  const invite = await Invitation.findOne({ tokenHash: sha256(token) }).populate("facilityId", "name type city status");
  if (!invite) throw new AppError("Invitation could not be found.", 404, "INVITE_NOT_FOUND");
  if (invite.status === INVITE_STATUS.ACCEPTED) {
    throw new AppError("This invitation has already been accepted.", 410, "INVITE_USED");
  }
  if (invite.status === INVITE_STATUS.DECLINED || invite.status === INVITE_STATUS.REVOKED) {
    throw new AppError("This invitation is no longer valid.", 410, "INVITE_INVALID");
  }
  if (invite.expiresAt < new Date()) {
    invite.status = INVITE_STATUS.EXPIRED;
    await invite.save();
    throw new AppError("Invitation has expired.", 410, "INVITE_EXPIRED");
  }
  if (invite.status === INVITE_STATUS.SENT) {
    invite.status = INVITE_STATUS.OPENED;
    invite.openedAt = new Date();
    await invite.save();
  }
  const existing = await User.findOne({ email: invite.email }).select("name email role status");
  return { invite, existingUser: existing, tokenValid: true };
}

export async function activateDoctorAccount({ token, password, otp }) {
  const invite = await Invitation.findOne({
    tokenHash: sha256(token),
    status: { $in: [INVITE_STATUS.SENT, INVITE_STATUS.OPENED] },
    expiresAt: { $gt: new Date() },
  });
  if (!invite) throw new AppError("Invitation has expired.", 410, "INVITE_EXPIRED");
  await verifyOtp(invite.email, otp, "INVITE");

  let user = await User.findOne({ email: invite.email });
  if (user && user.role !== ROLES.DOCTOR) {
    throw new AppError("This email is already used by a different provider role.", 409, "ROLE_CONFLICT");
  }
  if (!user) {
    user = await User.create({
      name: invite.name,
      email: invite.email,
      phone: invite.phone,
      passwordHash: await hashPassword(password),
      role: ROLES.DOCTOR,
      status: USER_STATUS.ACTIVE,
    });
  } else if (password && !user.passwordHash) {
    user.passwordHash = await hashPassword(password);
    user.status = USER_STATUS.ACTIVE;
    await user.save();
  } else if (password && user.passwordHash) {
    throw new AppError("An account already exists. Sign in to accept this invitation.", 409, "ACCOUNT_EXISTS");
  }

  let profile = await DoctorProfile.findOne({ userId: user._id });
  if (!profile) {
    profile = await DoctorProfile.create({
      userId: user._id,
      registrationNumber: invite.registrationNumber,
      specialization: invite.specialization,
      qualification: invite.qualification,
      experienceYears: invite.experienceYears || 0,
      languages: ["English", "Marathi", "Hindi"],
      credentialsVerified: true,
      verifiedAt: new Date(),
    });
  }

  return { user, profile, invite };
}

export async function acceptInvitation(req, token) {
  const invite = await Invitation.findOne({
    tokenHash: sha256(token),
    status: { $in: [INVITE_STATUS.SENT, INVITE_STATUS.OPENED] },
    expiresAt: { $gt: new Date() },
  });
  if (!invite) throw new AppError("Invitation has expired.", 410, "INVITE_EXPIRED");
  if (req.user.email !== invite.email) {
    throw new AppError("Sign in with the invited email address to accept.", 403, "EMAIL_MISMATCH");
  }
  if (req.user.role !== ROLES.DOCTOR) {
    throw new AppError("Only a doctor account can accept this invitation.", 403, "FORBIDDEN");
  }

  let profile = await DoctorProfile.findOne({ userId: req.user._id });
  if (!profile) {
    profile = await DoctorProfile.create({
      userId: req.user._id,
      registrationNumber: invite.registrationNumber,
      specialization: invite.specialization,
      qualification: invite.qualification,
      experienceYears: invite.experienceYears || 0,
      credentialsVerified: true,
      verifiedAt: new Date(),
    });
  }

  const existingLink = await FacilityDoctor.findOne({
    doctorProfileId: profile._id,
    facilityId: invite.facilityId,
  });
  if (existingLink?.status === "ACTIVE") {
    throw new AppError("You already belong to this facility.", 409, "ALREADY_LINKED");
  }
  if (existingLink) {
    existingLink.status = "ACTIVE";
    existingLink.departmentId = invite.departmentId;
    existingLink.consultationSchedule = invite.consultationSchedule;
    await existingLink.save();
  } else {
    await FacilityDoctor.create({
      doctorProfileId: profile._id,
      userId: req.user._id,
      facilityId: invite.facilityId,
      departmentId: invite.departmentId,
      status: "ACTIVE",
      consultationSchedule: invite.consultationSchedule,
    });
  }

  invite.status = INVITE_STATUS.ACCEPTED;
  invite.acceptedAt = new Date();
  await invite.save();
  await writeAudit(req, {
    action: "DOCTOR_ACCEPT",
    resource: "Invitation",
    resourceId: invite._id,
    facilityId: invite.facilityId,
  });
  return { accepted: true, facilityId: invite.facilityId };
}

export async function declineInvitation(req, token) {
  const invite = await Invitation.findOne({ tokenHash: sha256(token) });
  if (!invite) throw new AppError("Invitation could not be found.", 404, "INVITE_NOT_FOUND");
  if (req.user.email !== invite.email) throw new AppError("Not allowed.", 403, "FORBIDDEN");
  invite.status = INVITE_STATUS.DECLINED;
  await invite.save();
  return { declined: true };
}
