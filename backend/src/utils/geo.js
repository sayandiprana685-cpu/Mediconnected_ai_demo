export function haversineKm(lat1, lng1, lat2, lng2) {
  const a = [lat1, lng1, lat2, lng2].map(Number);
  if (a.some((n) => Number.isNaN(n))) return null;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(a[2] - a[0]);
  const dLng = toRad(a[3] - a[1]);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(a[2])) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)) * 10) / 10;
}

export function isFacilityOpenNow(operatingHours, now = new Date()) {
  if (!Array.isArray(operatingHours) || !operatingHours.length) return { open: null, closesAt: null };
  const day = now.getDay();
  const row = operatingHours.find((h) => Number(h.day) === day);
  if (!row) return { open: null, closesAt: null };
  if (row.closed) return { open: false, closesAt: null };
  if (!row.open || !row.close) return { open: true, closesAt: row.close || null };
  const [oh, om] = String(row.open).split(":").map(Number);
  const [ch, cm] = String(row.close).split(":").map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  const start = oh * 60 + (om || 0);
  const end = ch * 60 + (cm || 0);
  const open = end > start ? mins >= start && mins <= end : mins >= start || mins <= end;
  return { open, closesAt: row.close };
}

export function locationBand({ facility, district, city, userLat, userLng }) {
  const dCity = String(facility.city || "").trim().toLowerCase();
  const dDist = String(facility.district || "").trim().toLowerCase();
  const cityN = String(city || "").trim().toLowerCase();
  const distN = String(district || "").trim().toLowerCase();
  const km = facility.geo?.lat != null && userLat != null
    ? haversineKm(userLat, userLng, facility.geo.lat, facility.geo.lng)
    : null;
  if (cityN && dCity === cityN) return { band: "same_city", distanceKm: km };
  if (distN && dDist === distN) return { band: "same_district", distanceKm: km };
  if (km != null && km <= 25) return { band: "nearby", distanceKm: km };
  return { band: km != null ? "nearby" : "same_district", distanceKm: km };
}

export function rankProviders(list, { district, city, lat, lng }) {
  const cityN = String(city || "").toLowerCase();
  const distN = String(district || "").toLowerCase();
  return [...list].sort((a, b) => {
    const ac = String(a.city || "").toLowerCase() === cityN ? 0 : 1;
    const bc = String(b.city || "").toLowerCase() === cityN ? 0 : 1;
    if (ac !== bc) return ac - bc;
    const ad = String(a.district || "").toLowerCase() === distN ? 0 : 1;
    const bd = String(b.district || "").toLowerCase() === distN ? 0 : 1;
    if (ad !== bd) return ad - bd;
    const ak = a.geo?.lat != null && lat != null ? haversineKm(lat, lng, a.geo.lat, a.geo.lng) : 9999;
    const bk = b.geo?.lat != null && lat != null ? haversineKm(lat, lng, b.geo.lat, b.geo.lng) : 9999;
    return (ak ?? 9999) - (bk ?? 9999);
  });
}

export function publicFacility(doc, locCtx = {}) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : { ...doc };
  const hours = isFacilityOpenNow(o.operatingHours);
  const band = locationBand({
    facility: o,
    district: locCtx.district,
    city: locCtx.city,
    userLat: locCtx.lat,
    userLng: locCtx.lng,
  });
  return {
    id: String(o._id),
    name: o.name,
    type: o.type,
    status: o.status,
    address: o.address,
    city: o.city,
    district: o.district,
    state: o.state,
    pin: o.pin,
    country: o.country || "India",
    geo: o.geo || null,
    contactNumber: o.contactNumber,
    emergencyAvailable: !!o.emergencyAvailable,
    consultationAvailable: o.consultationAvailable !== false,
    diagnosticAvailable: !!o.diagnosticAvailable,
    medicineAvailable: !!o.medicineAvailable,
    deliveryAvailable: !!o.deliveryAvailable,
    pickupAvailable: o.pickupAvailable !== false,
    operatingHours: o.operatingHours || [],
    open: hours.open,
    closesAt: hours.closesAt,
    band: band.band,
    distanceKm: band.distanceKm,
    description: o.description || "",
    updatedAt: o.updatedAt,
  };
}
