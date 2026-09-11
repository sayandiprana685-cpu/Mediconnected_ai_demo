import {
  Department,
  DoctorProfile,
  FacilityDoctor,
  Invitation,
  Schedule,
  User,
} from "../models/index.js";
import { acceptInvitation, activateDoctorAccount, createInvitation, declineInvitation, openInvitation } from "../services/invitation.service.js";
import { requestOtp } from "../services/auth.service.js";
import { AppError, asyncHandler } from "../utils/errors.js";
import { todayKey } from "../utils/time.js";
import { setAuthCookies } from "../services/auth.service.js";
import { randomToken, sha256, signRefreshToken, cookieOptions } from "../utils/crypto.js";
import { writeAudit } from "../services/audit.service.js";
import { publicUser, resolveTodayActive, validateScheduleBlocks } from "../utils/helpers.js";

async function decorateFacilityDoctors(links, facilityId) {
  const userIds = links.map((l) => l.userId?._id || l.userId).filter(Boolean);
  const schedules = await Schedule.find({ facilityId, doctorUserId: { $in: userIds } });
  const byUser = new Map(schedules.map((s) => [String(s.doctorUserId), s]));
  return links.map((l) => {
    const o = l.toObject ? l.toObject() : { ...l };
    o.todayActive = resolveTodayActive(l, l.doctorProfileId);
    o.schedule = byUser.get(String(l.userId?._id || l.userId)) || null;
    return o;
  });
}

async function requireLinkedDoctor(facilityId, doctorUserId) {
  const link = await FacilityDoctor.findOne({ facilityId, userId: doctorUserId });
  if (!link) throw new AppError("Doctor is not linked to this facility.", 404, "DOCTOR_NOT_AT_FACILITY");
  return link;
}

export const doctorController = {
  listFacilityDoctors: asyncHandler(async (req, res) => {
    const links = await FacilityDoctor.find({ facilityId: req.facilityId })
      .populate("userId", "name email phone status")
      .populate("departmentId", "name")
      .populate("doctorProfileId");
    const invites = await Invitation.find({ facilityId: req.facilityId }).sort({ createdAt: -1 }).limit(50);
    res.json({ doctors: await decorateFacilityDoctors(links, req.facilityId), invitations: invites });
  }),

  invite: asyncHandler(async (req, res) => {
    const result = await createInvitation(req, req.body);
    res.status(201).json({
      invitation: result.invite,
      demoLink: result.demoLink,
      message: "Invitation sent. The doctor must complete OTP verification before joining.",
    });
  }),

  previewInvite: asyncHandler(async (req, res) => {
    const data = await openInvitation(req.params.token);
    res.json(data);
  }),

  requestInviteOtp: asyncHandler(async (req, res) => {
    const data = await openInvitation(req.params.token);
    await requestOtp(data.invite.email, "INVITE");
    res.json({ message: "A verification code was sent to the invited email." });
  }),

  activate: asyncHandler(async (req, res) => {
    const { user } = await activateDoctorAccount(req.body);
    const { access, refresh } = setAuthCookies(res, user);
    user.refreshTokenHash = sha256(refresh);
    await user.save();
    const preview = await openInvitation(req.body.token);
    res.json({ user, invite: preview.invite, message: "Account ready. Accept the facility invitation to begin." });
  }),

  accept: asyncHandler(async (req, res) => {
    const result = await acceptInvitation(req, req.params.token);
    res.json(result);
  }),

  decline: asyncHandler(async (req, res) => {
    const result = await declineInvitation(req, req.params.token);
    res.json(result);
  }),

  profile: asyncHandler(async (req, res) => {
    const profile = await DoctorProfile.findOne({ userId: req.user._id });
    const links = await FacilityDoctor.find({ userId: req.user._id, status: "ACTIVE" }).populate(
      "facilityId",
      "name type city status"
    );
    res.json({ profile, facilities: links.map((l) => l.facilityId), user: publicUser(req.user) });
  }),

  updateProfile: asyncHandler(async (req, res) => {
    const b = req.body || {};
    const patch = {};
    if (b.languages !== undefined) patch.languages = b.languages;
    if (b.teleconsultationAvailable !== undefined) patch.teleconsultationAvailable = !!b.teleconsultationAvailable;
    if (b.photoUrl !== undefined) {
      patch.photoUrl = b.photoUrl;
      req.user.photoUrl = b.photoUrl;
    }
    if (b.specialization != null) patch.specialization = String(b.specialization).trim();
    if (b.qualification != null) patch.qualification = String(b.qualification).trim();
    if (b.experienceYears !== undefined) patch.experienceYears = Number(b.experienceYears);
    if (b.registrationNumber != null) {
      const reg = String(b.registrationNumber).trim();
      if (!reg) throw new AppError("Registration number is required.", 422, "REG_INVALID");
      const taken = await DoctorProfile.findOne({ registrationNumber: reg, userId: { $ne: req.user._id } });
      if (taken) throw new AppError("This registration number is already on file.", 409, "REG_TAKEN");
      patch.registrationNumber = reg;
    }
    if (b.credentialsVerified !== undefined || b.verifiedAt !== undefined) {
      throw new AppError("You cannot change credential verification.", 403, "FORBIDDEN");
    }
    const profile = await DoctorProfile.findOneAndUpdate({ userId: req.user._id }, patch, { new: true });
    if (!profile) throw new AppError("Doctor profile not found.", 404, "NOT_FOUND");
    if (b.name) {
      const name = String(b.name).trim();
      if (name.length < 2) throw new AppError("Enter your full name.", 422, "NAME_INVALID");
      req.user.name = name;
    }
    if (b.name || b.photoUrl !== undefined) await req.user.save();
    await writeAudit(req, { action: "PROFILE_UPDATE", resource: "DoctorProfile", resourceId: profile._id });
    res.json({ profile, user: publicUser(req.user), message: "Settings saved successfully." });
  }),

  getSchedule: asyncHandler(async (req, res) => {
    const schedule = await Schedule.findOne({ doctorUserId: req.user._id, facilityId: req.facilityId });
    res.json({ schedule });
  }),

  saveSchedule: asyncHandler(async (req, res) => {
    const blocks = req.body.blocks || [];
    validateScheduleBlocks(blocks);
    const schedule = await Schedule.findOneAndUpdate(
      { doctorUserId: req.user._id, facilityId: req.facilityId },
      {
        blocks,
        unavailableDates: req.body.unavailableDates || [],
      },
      { new: true, upsert: true }
    );
    await writeAudit(req, {
      action: "DOCTOR_AVAILABILITY_UPDATE",
      resource: "Schedule",
      resourceId: schedule._id,
      facilityId: req.facilityId,
    });
    res.json({ schedule, message: "Settings saved successfully." });
  }),

  getDoctorSchedule: asyncHandler(async (req, res) => {
    await requireLinkedDoctor(req.facilityId, req.params.doctorUserId);
    const schedule = await Schedule.findOne({
      doctorUserId: req.params.doctorUserId,
      facilityId: req.facilityId,
    });
    res.json({ schedule });
  }),

  saveDoctorSchedule: asyncHandler(async (req, res) => {
    await requireLinkedDoctor(req.facilityId, req.params.doctorUserId);
    const blocks = req.body.blocks || [];
    validateScheduleBlocks(blocks);
    const schedule = await Schedule.findOneAndUpdate(
      { doctorUserId: req.params.doctorUserId, facilityId: req.facilityId },
      {
        blocks,
        unavailableDates: req.body.unavailableDates || [],
      },
      { new: true, upsert: true }
    );
    await writeAudit(req, {
      action: "DOCTOR_AVAILABILITY_UPDATE",
      resource: "Schedule",
      resourceId: schedule._id,
      facilityId: req.facilityId,
      metadata: { doctorUserId: req.params.doctorUserId },
    });
    res.json({ schedule, message: "Settings saved successfully." });
  }),

  setTodayStatus: asyncHandler(async (req, res) => {
    if (typeof req.body.active !== "boolean") {
      throw new AppError("Send active as true or false.", 422, "TODAY_STATUS_INVALID");
    }
    const link = await FacilityDoctor.findOne({ userId: req.user._id, facilityId: req.facilityId });
    if (!link) throw new AppError("You are not linked to this facility.", 404, "DOCTOR_NOT_AT_FACILITY");
    link.todayActive = req.body.active;
    link.todayActiveOn = todayKey();
    await link.save();
    await writeAudit(req, {
      action: "DOCTOR_AVAILABILITY_UPDATE",
      resource: "FacilityDoctor",
      resourceId: link._id,
      facilityId: req.facilityId,
      metadata: { todayActive: link.todayActive },
    });
    const profile = await DoctorProfile.findOne({ userId: req.user._id });
    res.json({
      todayActive: resolveTodayActive(link, profile),
      todayActiveOn: link.todayActiveOn,
    });
  }),

  facilityDoctorAvailability: asyncHandler(async (req, res) => {
    const links = await FacilityDoctor.find({ facilityId: req.facilityId, status: "ACTIVE" })
      .populate("userId", "name")
      .populate("doctorProfileId", "availability specialization");
    res.json({ doctors: await decorateFacilityDoctors(links, req.facilityId) });
  }),

  setMemberAccess: asyncHandler(async (req, res) => {
    const status = req.body.status;
    if (!["ACTIVE", "INACTIVE"].includes(status)) {
      throw new AppError("Status must be ACTIVE or INACTIVE (facility access, not today's availability).", 422, "STATUS_INVALID");
    }
    const link = await requireLinkedDoctor(req.facilityId, req.params.doctorUserId);
    link.status = status;
    await link.save();
    await writeAudit(req, {
      action: "MEMBER_ACCESS_UPDATE",
      resource: "FacilityDoctor",
      resourceId: link._id,
      facilityId: req.facilityId,
      metadata: { doctorUserId: req.params.doctorUserId, status },
    });
    res.json({ link, message: "Settings saved successfully." });
  }),
};

void randomToken;
void User;
void Department;
