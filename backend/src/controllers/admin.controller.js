import {
  AuditLog,
  DoctorProfile,
  Facility,
  FacilityDoctor,
  MedicineRequest,
  User,
  VerificationRequest,
} from "../models/index.js";
import { FACILITY_STATUS, USER_STATUS } from "../utils/constants.js";
import { AppError, asyncHandler } from "../utils/errors.js";
import { sendVerificationResult } from "../services/email.service.js";
import { writeAudit } from "../services/audit.service.js";

export const adminController = {
  facilities: asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.district) filter.district = req.query.district;
    const facilities = await Facility.find(filter).sort({ createdAt: -1 }).limit(200);
    res.json({ facilities });
  }),

  facilityOne: asyncHandler(async (req, res) => {
    const facility = await Facility.findById(req.params.id);
    if (!facility) throw new AppError("Facility not found.", 404, "NOT_FOUND");
    const doctors = await FacilityDoctor.find({ facilityId: facility._id, status: "ACTIVE" }).populate("userId", "name email");
    res.json({ facility, doctors });
  }),

  verifications: asyncHandler(async (req, res) => {
    const items = await VerificationRequest.find({
      status: { $in: [FACILITY_STATUS.UNDER_REVIEW, FACILITY_STATUS.PENDING_VERIFICATION, FACILITY_STATUS.CORRECTION_REQUESTED] },
    })
      .populate("facilityId")
      .sort({ createdAt: -1 });
    res.json({ requests: items });
  }),

  verify: asyncHandler(async (req, res) => {
    const facility = await Facility.findById(req.params.id);
    if (!facility) throw new AppError("Facility not found.", 404, "NOT_FOUND");
    const approved = req.body.decision === "VERIFY";
    const correction = req.body.decision === "REQUEST_CORRECTION";
    if (correction) {
      facility.status = FACILITY_STATUS.CORRECTION_REQUESTED;
      facility.rejectionReason = req.body.reason;
      facility.verifiedAt = undefined;
    } else {
      facility.status = approved ? FACILITY_STATUS.VERIFIED : FACILITY_STATUS.REJECTED;
      facility.rejectionReason = approved ? undefined : req.body.reason;
      facility.verifiedAt = approved ? new Date() : undefined;
    }
    facility.verifiedBy = req.user._id;
    await facility.save();
    await VerificationRequest.findOneAndUpdate(
      { facilityId: facility._id },
      {
        status: facility.status,
        notes: req.body.reason,
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
      },
      { sort: { createdAt: -1 } }
    );
    if (!correction) await sendVerificationResult(facility.officialEmail, facility.name, approved, req.body.reason);
    await writeAudit(req, {
      action: correction ? "FACILITY_CORRECTION" : approved ? "FACILITY_VERIFY" : "FACILITY_REJECT",
      resource: "Facility",
      resourceId: facility._id,
      facilityId: facility._id,
    });
    res.json({ facility });
  }),

  doctors: asyncHandler(async (req, res) => {
    const profiles = await DoctorProfile.find({ credentialsVerified: true })
      .populate("userId", "name email phone status")
      .limit(200);
    const links = await FacilityDoctor.find({
      doctorProfileId: { $in: profiles.map((p) => p._id) },
      status: "ACTIVE",
    }).populate("facilityId", "name type city");
    res.json({
      doctors: profiles.map((p) => ({
        ...p.toObject(),
        facilities: links.filter((l) => String(l.doctorProfileId) === String(p._id)).map((l) => l.facilityId),
      })),
    });
  }),

  suspendUser: asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError("User not found.", 404, "NOT_FOUND");
    user.status = req.body.status || USER_STATUS.SUSPENDED;
    await user.save();
    await writeAudit(req, { action: "ACCOUNT_SUSPEND", resource: "User", resourceId: user._id, metadata: { status: user.status } });
    res.json({ user: { id: user._id, status: user.status } });
  }),

  audit: asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.action) filter.action = req.query.action;
    const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(200).populate("actorId", "name email role");
    res.json({ logs });
  }),

  medicineOrders: asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const rows = await MedicineRequest.find(filter)
      .populate("fromFacilityId", "name type city")
      .populate("pharmacyFacilityId", "name city type")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({
      orders: rows.map((r) => ({
        _id: r._id,
        requestNo: r.requestNo,
        status: r.status,
        paymentStatus: r.paymentStatus || "NOT_REQUIRED",
        fulfillment: r.fulfillment || "",
        createdAt: r.createdAt,
        shop: r.pharmacyFacilityId,
        facility: r.fromFacilityId,
        orderedBy: r.createdBy?.name,
        itemCount: r.items?.length || 0,
      })),
    });
  }),

  medicineOrderOne: asyncHandler(async (req, res) => {
    const r = await MedicineRequest.findById(req.params.id)
      .populate("fromFacilityId", "name type city district address contactNumber")
      .populate("pharmacyFacilityId", "name city district address contactNumber type")
      .populate("createdBy", "name");
    if (!r) throw new AppError("Medicine order not found.", 404, "NOT_FOUND");
    res.json({
      order: {
        _id: r._id,
        requestNo: r.requestNo,
        status: r.status,
        paymentStatus: r.paymentStatus || "NOT_REQUIRED",
        fulfillment: r.fulfillment || "",
        notes: r.notes,
        items: r.items,
        history: r.history,
        createdAt: r.createdAt,
        shop: r.pharmacyFacilityId,
        facility: r.fromFacilityId,
        orderedBy: r.createdBy?.name,
        medicinesTotal: r.medicinesTotal,
        deliveryCharge: r.deliveryCharge,
        grandTotal: r.grandTotal,
      },
    });
  }),
};
