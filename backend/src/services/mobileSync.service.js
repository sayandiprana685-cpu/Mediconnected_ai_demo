import {
  DoctorProfile,
  Facility,
  FacilityDoctor,
  MedicineItem,
  Notification,
  User,
} from "../models/index.js";
import { FACILITY_STATUS, FACILITY_TYPES, MEDICINE_STATUS, USER_STATUS } from "../utils/constants.js";
import { publicFacility } from "../utils/geo.js";

const PROVIDER_SELECT =
  "name type status address city district state pin country geo contactNumber emergencyAvailable consultationAvailable diagnosticAvailable medicineAvailable deliveryAvailable pickupAvailable operatingHours description updatedAt";

export async function incrementalSync({ patient, updatedSince, district, city }) {
  const dist = district || patient.district;
  const cit = city || patient.city;
  if (!dist && !cit) {
    return { providers: [], doctors: [], medicines: [], lastSyncAt: new Date().toISOString(), warning: "NO_LOCATION" };
  }
  const since = updatedSince ? new Date(updatedSince) : null;
  const locFilter = {
    status: FACILITY_STATUS.VERIFIED,
    $or: [
      ...(dist ? [{ district: new RegExp(`^${escape(dist)}$`, "i") }] : []),
      ...(cit ? [{ city: new RegExp(`^${escape(cit)}$`, "i") }] : []),
    ],
  };
  if (since && !Number.isNaN(since.getTime())) locFilter.updatedAt = { $gt: since };

  const facilities = await Facility.find(locFilter).select(PROVIDER_SELECT).limit(400);
  const locCtx = { district: dist, city: cit, lat: patient.geo?.lat, lng: patient.geo?.lng };
  const providers = facilities.map((f) => publicFacility(f, locCtx));

  const clinicalIds = facilities
    .filter((f) => [FACILITY_TYPES.HOSPITAL, FACILITY_TYPES.CLINIC, FACILITY_TYPES.NURSING_HOME].includes(f.type))
    .map((f) => f._id);
  const links = await FacilityDoctor.find({ facilityId: { $in: clinicalIds }, status: "ACTIVE" });
  const userIds = [...new Set(links.map((l) => String(l.userId)))];
  const [users, profiles] = await Promise.all([
    User.find({ _id: { $in: userIds }, status: USER_STATUS.ACTIVE }).select("name photoUrl"),
    DoctorProfile.find({ userId: { $in: userIds } }),
  ]);
  const userMap = Object.fromEntries(users.map((u) => [String(u._id), u]));
  const profMap = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));
  const facMap = Object.fromEntries(facilities.map((f) => [String(f._id), f]));
  const doctors = links
    .map((l) => {
      const u = userMap[String(l.userId)];
      const p = profMap[String(l.userId)];
      const f = facMap[String(l.facilityId)];
      if (!u || !f) return null;
      return {
        id: String(u._id),
        name: u.name,
        specialization: p?.specialization || "General",
        qualification: p?.qualification || "",
        experienceYears: p?.experienceYears || 0,
        availability: p?.availability || "OFFLINE",
        facilityId: String(f._id),
        facilityName: f.name,
        city: f.city,
        district: f.district,
      };
    })
    .filter(Boolean);

  const pharmacyIds = facilities
    .filter((f) => [FACILITY_TYPES.PHARMACY, FACILITY_TYPES.MEDICINE_SHOP].includes(f.type))
    .map((f) => f._id);
  const medFilter = { facilityId: { $in: pharmacyIds }, status: MEDICINE_STATUS.ACTIVE };
  if (since && !Number.isNaN(since.getTime())) medFilter.updatedAt = { $gt: since };
  const meds = await MedicineItem.find(medFilter).select("name genericName brandName strength dosageForm facilityId quantity unitPrice prescriptionRequired updatedAt").limit(800);
  const medicines = meds.map((m) => ({
    id: String(m._id),
    name: m.name,
    genericName: m.genericName,
    brandName: m.brandName,
    strength: m.strength,
    dosageForm: m.dosageForm,
    facilityId: String(m.facilityId),
    quantity: m.quantity,
    unitPrice: m.unitPrice,
    prescriptionRequired: !!m.prescriptionRequired,
    updatedAt: m.updatedAt,
  }));

  return {
    providers,
    doctors,
    medicines,
    district: dist,
    city: cit,
    lastSyncAt: new Date().toISOString(),
    incremental: !!since,
  };
}

export async function listNotifications(userId) {
  const rows = await Notification.find({ userId }).sort({ createdAt: -1 }).limit(50);
  const unread = await Notification.countDocuments({ userId, read: false });
  return { notifications: rows, unread };
}

export async function markNotificationsRead(userId) {
  await Notification.updateMany({ userId, read: false }, { $set: { read: true } });
  return { ok: true };
}

function escape(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
