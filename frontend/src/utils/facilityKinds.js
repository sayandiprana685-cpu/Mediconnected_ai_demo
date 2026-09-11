export const CLINICAL_TYPES = ["HOSPITAL", "CLINIC", "NURSING_HOME"];
export const DIAGNOSTIC_TYPES = ["DIAGNOSTIC_CENTRE", "LABORATORY"];
export const PHARMACY_KINDS = ["PHARMACY", "MEDICINE_SHOP"];

export function isDiagnosticType(type) {
  return DIAGNOSTIC_TYPES.includes(type);
}
export function isPharmacyType(type) {
  return PHARMACY_KINDS.includes(type);
}
export function isClinicalType(type) {
  return CLINICAL_TYPES.includes(type);
}

export function isBuyerType(type) {
  return isClinicalType(type) || isDiagnosticType(type);
}

export function facilityKind(type) {
  if (isDiagnosticType(type)) return "diagnostic";
  if (isPharmacyType(type)) return "pharmacy";
  return "clinical";
}

export function typeLabel(type) {
  return String(type || "").replaceAll("_", " ");
}
