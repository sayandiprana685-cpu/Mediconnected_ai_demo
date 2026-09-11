import {
  Department,
  Facility,
  Service,
  User,
  VerificationRequest,
} from "../models/index.js";
import { FACILITY_STATUS, FACILITY_TYPES, isDiagnosticType, isPharmacyType, normalizeFacilityType, ROLES, USER_STATUS } from "../utils/constants.js";
import { AppError, asyncHandler } from "../utils/errors.js";
import { hashPassword } from "../utils/crypto.js";
import { sendFacilityRegistered } from "../services/email.service.js";
import { writeAudit } from "../services/audit.service.js";
import { assertDisplayName } from "../utils/helpers.js";

export const facilityController = {
  register: asyncHandler(async (req, res) => {
    const b = req.body;
    const type = normalizeFacilityType(b.type);
    if (!Object.values(FACILITY_TYPES).includes(type)) throw new AppError("Invalid provider type.", 422, "TYPE_INVALID");
    const exists = await Facility.findOne({
      $or: [{ officialEmail: b.officialEmail.toLowerCase() }, { licenceNumber: b.licenceNumber }],
    });
    if (exists) throw new AppError("A facility with this email or licence number already exists.", 409, "DUPLICATE");
    if (await User.findOne({ email: b.adminEmail.toLowerCase() })) {
      throw new AppError("An account already exists for the administrator email.", 409, "DUPLICATE_USER");
    }
    const diagnostic = isDiagnosticType(type) || !!b.diagnosticAvailable;
    const medicine = isPharmacyType(type) || !!b.medicineAvailable;
    const consultation = isDiagnosticType(type) || isPharmacyType(type) ? false : b.consultationAvailable !== false;

    const facility = await Facility.create({
      name: b.name,
      legalName: b.legalName || b.name,
      type,
      status: FACILITY_STATUS.PENDING_VERIFICATION,
      address: b.address,
      city: b.city,
      district: b.district || b.city,
      state: b.state || "Maharashtra",
      country: b.country || "India",
      pin: b.pin,
      geo: b.geo,
      contactNumber: b.contactNumber,
      officialEmail: b.officialEmail.toLowerCase(),
      website: b.website,
      licenceNumber: b.licenceNumber,
      licenceAuthority: b.licenceAuthority,
      licenceIssuedAt: b.licenceIssuedAt || undefined,
      licenceExpiresAt: b.licenceExpiresAt || undefined,
      accreditation: b.accreditation,
      adminDesignation: b.adminDesignation,
      responsibleProfessional: b.responsibleProfessional || undefined,
      emergencyAvailable: !!b.emergencyAvailable,
      consultationAvailable: consultation,
      diagnosticAvailable: diagnostic,
      medicineAvailable: medicine,
      operatingHours: b.operatingHours || [],
      documents: b.documents || [],
    });

    const admin = await User.create({
      name: b.adminName,
      email: b.adminEmail.toLowerCase(),
      phone: b.adminPhone,
      passwordHash: await hashPassword(b.adminPassword),
      role: ROLES.FACILITY_ADMIN,
      status: USER_STATUS.ACTIVE,
      facilityId: facility._id,
    });

    const defaultDepts = isDiagnosticType(type) ? ["Laboratory"] : isPharmacyType(type) ? ["Dispensing"] : ["General Medicine"];
    const departments = b.departments?.length ? b.departments : defaultDepts;
    await Department.insertMany(departments.map((name) => ({ facilityId: facility._id, name })));
    const defaultSvcs = isDiagnosticType(type)
      ? (b.services?.length ? b.services : ["Pathology"])
      : isPharmacyType(type)
        ? (b.services?.length ? b.services : ["Retail dispensing"])
        : b.services?.length
          ? b.services
          : ["Outpatient consultation"];
    await Service.insertMany(
      defaultSvcs.map((name) => ({
        facilityId: facility._id,
        name,
        category: isDiagnosticType(type) ? "DIAGNOSTIC" : isPharmacyType(type) ? "PHARMACY" : "CONSULTATION",
      }))
    );

    await VerificationRequest.create({
      facilityId: facility._id,
      submittedBy: admin._id,
      status: FACILITY_STATUS.PENDING_VERIFICATION,
    });
    await writeAudit(req, { action: "FACILITY_REGISTER", resource: "Facility", resourceId: facility._id, facilityId: facility._id });
    await sendFacilityRegistered(facility.officialEmail, facility.name);
    res.status(201).json({
      facility: { id: facility._id, name: facility.name, status: facility.status },
      message: "Facility submitted for verification. Sign in after a government administrator reviews the request.",
    });
  }),

  mine: asyncHandler(async (req, res) => {
    const facility = await Facility.findById(req.facilityId);
    if (!facility) throw new AppError("Facility not found.", 404, "NOT_FOUND");
    const departments = await Department.find({ facilityId: facility._id });
    const services = await Service.find({ facilityId: facility._id });
    res.json({ facility, departments, services });
  }),

  updateMine: asyncHandler(async (req, res) => {
    const facility = await Facility.findById(req.facilityId);
    if (!facility) throw new AppError("Facility not found.", 404, "NOT_FOUND");
    if (String(req.user.facilityId) !== String(facility._id)) {
      throw new AppError("You are not authorised to update this facility.", 403, "FORBIDDEN");
    }
    const allowed = [
      "name",
      "type",
      "contactNumber",
      "officialEmail",
      "licenceNumber",
      "licenceAuthority",
      "operatingHours",
      "emergencyAvailable",
      "consultationAvailable",
      "diagnosticAvailable",
      "medicineAvailable",
      "geo",
      "address",
      "city",
      "district",
      "state",
      "country",
      "pin",
      "website",
      "logoUrl",
      "description",
      "legalName",
      "licenceIssuedAt",
      "licenceExpiresAt",
      "accreditation",
      "adminDesignation",
      "responsibleProfessional",
      "timezone",
      "dateFormat",
      "appointmentSlotMinutes",
      "notificationPrefs",
      "deliveryAvailable",
      "pickupAvailable",
    ];
    const blocked = ["status", "verifiedAt", "verifiedBy", "rejectionReason", "occupancyHint"];
    for (const k of blocked) {
      if (req.body[k] !== undefined) {
        throw new AppError("You cannot change verification or security fields.", 403, "FORBIDDEN");
      }
    }
    if (req.body.type && !Object.values(FACILITY_TYPES).includes(req.body.type)) {
      throw new AppError("Invalid facility type.", 422, "TYPE_INVALID");
    }
    if (req.body.officialEmail) {
      const email = String(req.body.officialEmail).toLowerCase();
      const dup = await Facility.findOne({ officialEmail: email, _id: { $ne: facility._id } });
      if (dup) throw new AppError("Another facility already uses this email.", 409, "DUPLICATE");
      req.body.officialEmail = email;
    }
    if (req.body.licenceNumber) {
      const dup = await Facility.findOne({ licenceNumber: req.body.licenceNumber, _id: { $ne: facility._id } });
      if (dup) throw new AppError("Another facility already uses this licence number.", 409, "DUPLICATE");
    }
    if (req.body.dateFormat && !["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"].includes(req.body.dateFormat)) {
      throw new AppError("Unsupported date format.", 422, "DATE_FORMAT_INVALID");
    }
    if (req.body.notificationPrefs && typeof req.body.notificationPrefs === "object") {
      const np = facility.notificationPrefs?.toObject?.() || facility.notificationPrefs || {};
      const next = { ...np };
      for (const k of ["appointments", "referrals", "email"]) {
        if (typeof req.body.notificationPrefs[k] === "boolean") next[k] = req.body.notificationPrefs[k];
      }
      req.body.notificationPrefs = next;
    }
    const patch = {};
    for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
    if (patch.name != null) patch.name = assertDisplayName(patch.name, "Facility name");
    if (!Object.keys(patch).length) throw new AppError("No facility fields to update.", 422, "EMPTY");
    Object.assign(facility, patch);
    await facility.save();
    await writeAudit(req, {
      action: "FACILITY_UPDATE",
      resource: "Facility",
      resourceId: facility._id,
      facilityId: facility._id,
      metadata: { fields: Object.keys(patch) },
    });
    res.json({ facility, message: "Settings saved successfully." });
  }),

  addDepartment: asyncHandler(async (req, res) => {
    const dept = await Department.create({ facilityId: req.facilityId, name: req.body.name, description: req.body.description });
    res.status(201).json({ department: dept });
  }),

  addService: asyncHandler(async (req, res) => {
    const service = await Service.create({
      facilityId: req.facilityId,
      name: req.body.name,
      category: req.body.category || "OTHER",
      available: req.body.available !== false,
    });
    res.status(201).json({ service });
  }),
};
