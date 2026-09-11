import {
  DoctorProfile,
  Facility,
  FacilityDoctor,
  MedicineItem,
  User,
} from "../models/index.js";
import { FACILITY_STATUS, FACILITY_TYPES, MEDICINE_STATUS, USER_STATUS } from "../utils/constants.js";
import { publicFacility, rankProviders } from "../utils/geo.js";
import { AppError } from "../utils/errors.js";

const PAGE = 30;

function locFrom(query, patient) {
  return {
    district: query.district || patient?.district,
    city: query.city || patient?.city,
    lat: query.lat != null ? Number(query.lat) : patient?.geo?.lat,
    lng: query.lng != null ? Number(query.lng) : patient?.geo?.lng,
    state: query.state || patient?.state,
  };
}

function typeFilter(type) {
  if (!type || type === "ALL") return null;
  const t = String(type).toUpperCase().replace(/[\s-]+/g, "_");
  if (t === "DIAGNOSTIC_CENTER") return FACILITY_TYPES.DIAGNOSTIC_CENTRE;
  if (t === "DOCTOR") return null;
  if (t === "MEDICINE" || t === "MEDICINES") return null;
  return t;
}

export async function discoverProviders({ query, patient }) {
  const loc = locFrom(query, patient);
  const type = typeFilter(query.type);
  const q = String(query.q || "").trim();
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(50, Math.max(1, Number(query.limit || PAGE)));

  const filter = { status: FACILITY_STATUS.VERIFIED };
  if (type && Object.values(FACILITY_TYPES).includes(type)) filter.type = type;
  if (loc.district) {
    filter.$or = [{ district: new RegExp(`^${escape(loc.district)}$`, "i") }, { city: new RegExp(`^${escape(loc.city || loc.district)}$`, "i") }];
  }
  if (q) {
    const rx = new RegExp(escape(q), "i");
    filter.$and = [
      ...(filter.$and || []),
      { $or: [{ name: rx }, { city: rx }, { district: rx }, { type: rx }, { address: rx }] },
    ];
  }

  const docs = await Facility.find(filter)
    .select(
      "name type status address city district state pin country geo contactNumber emergencyAvailable consultationAvailable diagnosticAvailable medicineAvailable deliveryAvailable pickupAvailable operatingHours description updatedAt"
    )
    .limit(200);
  const ranked = rankProviders(docs, loc).map((d) => publicFacility(d, loc));
  const start = (page - 1) * limit;
  return {
    providers: ranked.slice(start, start + limit),
    total: ranked.length,
    page,
    loc,
    online: true,
  };
}

export async function getProvider(id, locCtx) {
  const doc = await Facility.findOne({ _id: id, status: FACILITY_STATUS.VERIFIED });
  if (!doc) throw new AppError("This provider was not found, or is not verified yet.", 404, "NOT_FOUND");
  return publicFacility(doc, locCtx);
}

export async function discoverDoctors({ query, patient }) {
  const loc = locFrom(query, patient);
  const q = String(query.q || "").trim();
  const facilities = await Facility.find({
    status: FACILITY_STATUS.VERIFIED,
    type: { $in: [FACILITY_TYPES.HOSPITAL, FACILITY_TYPES.CLINIC, FACILITY_TYPES.NURSING_HOME] },
    ...(loc.district ? { district: new RegExp(`^${escape(loc.district)}$`, "i") } : {}),
  }).select("_id name type city district geo contactNumber operatingHours emergencyAvailable");
  const facIds = facilities.map((f) => f._id);
  const links = await FacilityDoctor.find({ facilityId: { $in: facIds }, status: "ACTIVE" });
  const userIds = [...new Set(links.map((l) => String(l.userId)))];
  const [users, profiles] = await Promise.all([
    User.find({ _id: { $in: userIds }, status: USER_STATUS.ACTIVE, role: "DOCTOR" }).select("name phone photoUrl"),
    DoctorProfile.find({ userId: { $in: userIds } }),
  ]);
  const userMap = Object.fromEntries(users.map((u) => [String(u._id), u]));
  const profMap = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));
  const facMap = Object.fromEntries(facilities.map((f) => [String(f._id), f]));
  let rows = links
    .map((l) => {
      const user = userMap[String(l.userId)];
      const profile = profMap[String(l.userId)];
      const facility = facMap[String(l.facilityId)];
      if (!user || !facility) return null;
      return {
        id: String(user._id),
        doctorProfileId: profile ? String(profile._id) : null,
        name: user.name,
        specialization: profile?.specialization || "General",
        qualification: profile?.qualification || "",
        experienceYears: profile?.experienceYears || 0,
        languages: profile?.languages || [],
        teleconsultationAvailable: !!profile?.teleconsultationAvailable,
        availability: profile?.availability || "OFFLINE",
        facility: publicFacility(facility, loc),
      };
    })
    .filter(Boolean);
  if (q) {
    const rx = new RegExp(escape(q), "i");
    rows = rows.filter((r) => rx.test(r.name) || rx.test(r.specialization) || rx.test(r.facility?.name || ""));
  }
  return { doctors: rows, loc, total: rows.length };
}

export async function searchAll({ query, patient }) {
  const q = String(query.q || "").trim();
  if (!q) return { results: [], groups: {} };
  const loc = locFrom(query, patient);
  const [providers, doctors, medicines] = await Promise.all([
    discoverProviders({ query: { ...query, q, limit: 20 }, patient }),
    discoverDoctors({ query: { ...query, q }, patient }),
    searchMedicines({ query: { ...query, q, limit: 20 }, patient }),
  ]);
  const results = [
    ...providers.providers.map((p) => ({ kind: "provider", ...p })),
    ...doctors.doctors.map((d) => ({ kind: "doctor", ...d })),
    ...medicines.medicines.map((m) => ({ kind: "medicine", ...m })),
  ];
  return {
    results,
    groups: {
      providers: providers.providers,
      doctors: doctors.doctors,
      medicines: medicines.medicines,
    },
    loc,
  };
}

export async function searchMedicines({ query, patient }) {
  const loc = locFrom(query, patient);
  const q = String(query.q || "").trim();
  const pharmacies = await Facility.find({
    status: FACILITY_STATUS.VERIFIED,
    type: { $in: [FACILITY_TYPES.PHARMACY, FACILITY_TYPES.MEDICINE_SHOP] },
    ...(loc.district ? { district: new RegExp(`^${escape(loc.district)}$`, "i") } : {}),
  }).select("_id name city district geo type contactNumber deliveryAvailable pickupAvailable operatingHours");
  const ids = pharmacies.map((p) => p._id);
  const filter = { facilityId: { $in: ids }, status: MEDICINE_STATUS.ACTIVE };
  if (q) {
    const rx = new RegExp(escape(q), "i");
    filter.$or = [{ name: rx }, { genericName: rx }, { brandName: rx }];
  }
  const items = await MedicineItem.find(filter).limit(80);
  const facMap = Object.fromEntries(pharmacies.map((f) => [String(f._id), f]));
  const medicines = items.map((m) => {
    const fac = facMap[String(m.facilityId)];
    return {
      id: String(m._id),
      name: m.name,
      genericName: m.genericName,
      brandName: m.brandName,
      strength: m.strength,
      dosageForm: m.dosageForm,
      quantity: m.quantity,
      unitPrice: m.unitPrice,
      prescriptionRequired: !!m.prescriptionRequired,
      pharmacy: fac ? publicFacility(fac, loc) : null,
    };
  });
  return { medicines, loc };
}

function escape(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
