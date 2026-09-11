import { Facility, FacilityDoctor } from "../models/index.js";
import {
  FACILITY_STATUS,
  ROLES,
  isDiagnosticType,
  isFacilityScopedRole,
  isBuyerType,
  isPharmacyType,
} from "../utils/constants.js";
import { AppError } from "../utils/errors.js";

export async function resolveFacilityContext(req, res, next) {
  try {
    if (!req.user) return next();
    if (req.user.role === ROLES.MAIN_ADMIN) {
      req.facilityId = req.query.facilityId || req.body.facilityId || undefined;
      return next();
    }
    if (req.user.role === ROLES.PATIENT) {
      return next();
    }
    if (isFacilityScopedRole(req.user.role)) {
      req.facilityId = req.user.facilityId;
      if (!req.facilityId) throw new AppError("No facility is linked to this account.", 403, "NO_FACILITY");
      return next();
    }
    if (req.user.role === ROLES.DOCTOR) {
      const headerId = req.header("x-facility-id") || req.query.facilityId || req.body.facilityId;
      const links = await FacilityDoctor.find({ userId: req.user._id, status: "ACTIVE" });
      req.doctorFacilities = links.map((l) => String(l.facilityId));
      if (!links.length) {
        req.facilityId = undefined;
        return next();
      }
      if (headerId) {
        if (!req.doctorFacilities.includes(String(headerId))) {
          throw new AppError("You are not linked to this facility.", 403, "FACILITY_DENIED");
        }
        req.facilityId = headerId;
      } else {
        req.facilityId = links[0].facilityId;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireFacility(req, res, next) {
  if (!req.facilityId) {
    return next(new AppError("Select a facility to continue.", 400, "FACILITY_REQUIRED"));
  }
  next();
}

export function requireVerifiedFacility(req, res, next) {
  const check = async () => {
    const facility = req.facility || (await Facility.findById(req.facilityId).select("status type name"));
    if (!facility) throw new AppError("Facility not found.", 404, "NOT_FOUND");
    if (facility.status !== FACILITY_STATUS.VERIFIED) {
      throw new AppError("This provider is not verified yet. Operational tools are limited until verification.", 403, "NOT_VERIFIED");
    }
    if (!req.facility) req.facility = facility;
  };
  check().then(() => next()).catch(next);
}

export function requireDiagnosticFacility(req, res, next) {
  Facility.findById(req.facilityId)
    .select("status type name address city state pin contactNumber officialEmail website")
    .then((facility) => {
      if (!facility) return next(new AppError("Facility not found.", 404, "NOT_FOUND"));
      if (!isDiagnosticType(facility.type)) {
        return next(new AppError("This action is only available to diagnostic centres and laboratories.", 403, "WRONG_PROVIDER_TYPE"));
      }
      req.facility = facility;
      next();
    })
    .catch(next);
}

export function requirePharmacyFacility(req, res, next) {
  Facility.findById(req.facilityId)
    .select("status type name deliveryAvailable pickupAvailable operatingHours city district")
    .then((facility) => {
      if (!facility) return next(new AppError("Facility not found.", 404, "NOT_FOUND"));
      if (!isPharmacyType(facility.type)) {
        return next(new AppError("This action is only available to pharmacies and medicine shops.", 403, "WRONG_PROVIDER_TYPE"));
      }
      req.facility = facility;
      next();
    })
    .catch(next);
}

export function requireBuyerFacility(req, res, next) {
  Facility.findById(req.facilityId)
    .select("status type name address city district state pin geo contactNumber operatingHours")
    .then((facility) => {
      if (!facility) return next(new AppError("Facility not found.", 404, "NOT_FOUND"));
      if (!isBuyerType(facility.type)) {
        return next(new AppError("Medicine ordering is available to hospitals, clinics, nursing homes, and diagnostic centres.", 403, "WRONG_PROVIDER_TYPE"));
      }
      req.facility = facility;
      next();
    })
    .catch(next);
}
