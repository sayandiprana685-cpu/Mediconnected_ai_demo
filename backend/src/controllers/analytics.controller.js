import {
  Appointment,
  DoctorProfile,
  Facility,
  FacilityDoctor,
  FollowUp,
  Patient,
  Referral,
  User,
} from "../models/index.js";
import { APPOINTMENT_STATUS, FACILITY_STATUS, REFERRAL_STATUS, ROLES } from "../utils/constants.js";
import { asyncHandler } from "../utils/errors.js";
import { resolveTodayActive } from "../utils/helpers.js";
import { endOfDayTz, todayRange } from "../utils/time.js";
import { getNetworkSettings } from "../models/index.js";
import mongoose from "mongoose";

function oid(id) {
  if (!id) return id;
  if (id instanceof mongoose.Types.ObjectId) return id;
  return mongoose.Types.ObjectId.createFromHexString(String(id));
}

function scopedToday(base = {}) {
  return { ...base, scheduledAt: todayRange() };
}

async function pendingFollowUpCount(filter) {
  return FollowUp.countDocuments({
    ...filter,
    status: { $in: ["PENDING", "SCHEDULED"] },
    dueAt: { $lte: endOfDayTz() },
  });
}

async function pendingFollowUpList(filter, limit = 8) {
  return FollowUp.find({
    ...filter,
    status: { $in: ["PENDING", "SCHEDULED"] },
    dueAt: { $lte: endOfDayTz() },
  })
    .populate("patientId", "name mrn")
    .sort({ dueAt: 1 })
    .limit(limit);
}

export const analyticsController = {
  doctorDashboard: asyncHandler(async (req, res) => {
    const facilityId = oid(req.facilityId);
    const doctorUserId = oid(req.user._id);
    const range = scopedToday({ facilityId, doctorUserId });
    const [appointments, waitingPatients, completedConsultations, pendingFollowUps, followUpRows] = await Promise.all([
      Appointment.find(range).populate("patientId", "name age sex mrn").sort({ scheduledAt: 1 }),
      Appointment.countDocuments({ ...range, status: APPOINTMENT_STATUS.WAITING }),
      Appointment.countDocuments({ ...range, status: APPOINTMENT_STATUS.COMPLETED }),
      pendingFollowUpCount({ facilityId, doctorUserId }),
      pendingFollowUpList({ facilityId, doctorUserId }),
    ]);
    const queue = appointments.filter((a) =>
      [APPOINTMENT_STATUS.CHECKED_IN, APPOINTMENT_STATUS.WAITING, APPOINTMENT_STATUS.IN_CONSULTATION].includes(a.status)
    );
    const [link, profile] = await Promise.all([
      FacilityDoctor.findOne({ userId: doctorUserId, facilityId }),
      DoctorProfile.findOne({ userId: doctorUserId }),
    ]);
    res.json({
      greetingName: req.user.name,
      timezone: "Asia/Kolkata",
      todayActive: resolveTodayActive(link, profile),
      todayActiveOn: link?.todayActiveOn || null,
      kpis: {
        todayAppointments: appointments.length,
        waitingPatients,
        waiting: waitingPatients,
        completedConsultations,
        completed: completedConsultations,
        pendingFollowUps,
      },
      appointments,
      queue,
      followUps: followUpRows,
    });
  }),

  facilityDashboard: asyncHandler(async (req, res) => {
    const facilityId = oid(req.user.facilityId || req.facilityId);
    const todayQ = scopedToday({ facilityId });
    const [
      todayPatients,
      todayAppointments,
      waitingPatients,
      completedConsultations,
      doctorsActive,
      pendingReferrals,
      pendingFollowUps,
    ] = await Promise.all([
      Appointment.distinct("patientId", todayQ),
      Appointment.countDocuments(todayQ),
      Appointment.countDocuments({ ...todayQ, status: APPOINTMENT_STATUS.WAITING }),
      Appointment.countDocuments({ ...todayQ, status: APPOINTMENT_STATUS.COMPLETED }),
      FacilityDoctor.countDocuments({ facilityId, status: "ACTIVE" }),
      Referral.countDocuments({
        $or: [{ fromFacilityId: facilityId }, { toFacilityId: facilityId }],
        status: { $in: [REFERRAL_STATUS.CREATED, REFERRAL_STATUS.ACCEPTED] },
      }),
      pendingFollowUpCount({ facilityId }),
    ]);
    const flow = {};
    await Promise.all(
      Object.values(APPOINTMENT_STATUS).map(async (s) => {
        flow[s] = await Appointment.countDocuments({ ...todayQ, status: s });
      })
    );
    const doctorLinks = await FacilityDoctor.find({ facilityId, status: "ACTIVE" })
      .populate("userId", "name")
      .populate("doctorProfileId", "availability specialization");
    const doctors = doctorLinks.map((d) => {
      const o = d.toObject();
      o.todayActive = resolveTodayActive(d, d.doctorProfileId);
      return o;
    });
    const referrals = await Referral.find({
      $or: [{ fromFacilityId: facilityId }, { toFacilityId: facilityId }],
    })
      .populate("patientId", "name")
      .sort({ createdAt: -1 })
      .limit(8);
    const facility = await Facility.findById(facilityId).select("name type");
    res.json({
      facility,
      timezone: "Asia/Kolkata",
      kpis: {
        todayPatients: todayPatients.length,
        todayAppointments,
        appointments: todayAppointments,
        waitingPatients,
        waiting: waitingPatients,
        completedConsultations,
        doctorsActive,
        pendingReferrals,
        pendingFollowUps,
        followUps: pendingFollowUps,
      },
      flow,
      doctors,
      referrals,
    });
  }),

  governmentDashboard: asyncHandler(async (req, res) => {
    const todayQ = scopedToday();
    const [
      total,
      verified,
      pending,
      doctors,
      patients,
      todayAppointments,
      waitingPatients,
      completedConsultations,
      pendingFollowUps,
    ] = await Promise.all([
      Facility.countDocuments(),
      Facility.countDocuments({ status: FACILITY_STATUS.VERIFIED }),
      Facility.countDocuments({ status: { $in: [FACILITY_STATUS.UNDER_REVIEW, FACILITY_STATUS.PENDING_VERIFICATION] } }),
      User.countDocuments({ role: ROLES.DOCTOR, status: "ACTIVE" }),
      Patient.countDocuments(),
      Appointment.countDocuments(todayQ),
      Appointment.countDocuments({ ...todayQ, status: APPOINTMENT_STATUS.WAITING }),
      Appointment.countDocuments({ ...todayQ, status: APPOINTMENT_STATUS.COMPLETED }),
      pendingFollowUpCount({}),
    ]);
    const referrals = await Referral.find({});
    const closed = referrals.filter((r) =>
      [REFERRAL_STATUS.CLOSED, REFERRAL_STATUS.CONSULTATION_COMPLETED].includes(r.status)
    ).length;
    const failed = referrals.filter((r) =>
      [REFERRAL_STATUS.DECLINED, REFERRAL_STATUS.EXPIRED, REFERRAL_STATUS.CANCELLED].includes(r.status)
    ).length;
    const byDistrict = await Facility.aggregate([
      { $match: { status: FACILITY_STATUS.VERIFIED } },
      { $group: { _id: "$district", count: { $sum: 1 }, overloaded: { $sum: { $cond: [{ $gt: ["$occupancyHint", 75] }, 1, 0] } } } },
      { $sort: { count: -1 } },
    ]);
    const demand = await Appointment.aggregate([
      { $match: { scheduledAt: { $gte: new Date(Date.now() - 7 * 86400000) } } },
      { $lookup: { from: "facilities", localField: "facilityId", foreignField: "_id", as: "f" } },
      { $unwind: "$f" },
      { $group: { _id: "$f.district", appointments: { $sum: 1 } } },
      { $sort: { appointments: -1 } },
    ]);
    const diagnostic = await Facility.countDocuments({ diagnosticAvailable: true, status: FACILITY_STATUS.VERIFIED });
    const medicine = await Facility.countDocuments({ medicineAvailable: true, status: FACILITY_STATUS.VERIFIED });
    const highRisk = referrals.filter(
      (r) =>
        ["URGENT", "EMERGENCY"].includes(r.priority) &&
        ![REFERRAL_STATUS.CLOSED, REFERRAL_STATUS.DECLINED, REFERRAL_STATUS.CANCELLED].includes(r.status)
    ).length;
    res.json({
      timezone: "Asia/Kolkata",
      network: { name: (await getNetworkSettings()).name },
      kpis: {
        totalFacilities: total,
        verifiedFacilities: verified,
        pendingVerification: pending,
        activeDoctors: doctors,
        patientsServed: patients,
        todayAppointments,
        waitingPatients,
        completedConsultations,
        todayConsultations: completedConsultations,
        pendingFollowUps,
        referralCompletionRate: referrals.length ? Math.round((closed / referrals.length) * 100) : 0,
        referralFailures: failed,
        averageWaitingQueue: waitingPatients,
        diagnosticAvailability: diagnostic,
        medicineAvailability: medicine,
        highRiskOpenReferrals: highRisk,
      },
      byDistrict,
      demand,
    });
  }),
};
