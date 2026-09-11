import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

function pick(addr, keys) {
  for (const k of keys) {
    if (addr[k]) return String(addr[k]);
  }
  return "";
}

function normalizeGoogle(result) {
  const parts = result.address_components || [];
  const byType = (t) => parts.find((p) => p.types?.includes(t))?.long_name || "";
  return {
    city: byType("locality") || byType("administrative_area_level_3") || byType("sublocality"),
    district: byType("administrative_area_level_3") || byType("administrative_area_level_2"),
    state: byType("administrative_area_level_1"),
    pin: byType("postal_code"),
    country: byType("country") || "India",
    address: result.formatted_address || "",
    source: "maps",
  };
}

function normalizeNominatim(json) {
  const a = json.address || {};
  return {
    city: pick(a, ["city", "town", "village", "municipality", "hamlet", "suburb"]),
    district: pick(a, ["state_district", "county", "district", "city_district"]),
    state: pick(a, ["state"]),
    pin: pick(a, ["postcode"]),
    country: pick(a, ["country"]) || "India",
    address: json.display_name || "",
    source: "nominatim",
  };
}

export async function reverseGeocode({ lat, lng }) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    throw new AppError("Location is not valid.", 422, "GEO_INVALID");
  }

  if (env.mapsApiKey) {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${encodeURIComponent(env.mapsApiKey)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.status === "OK" && data.results?.[0]) {
        return { lat: latitude, lng: longitude, ...normalizeGoogle(data.results[0]) };
      }
    }
  }

  const nom = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=14&addressdetails=1`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "MediConnectedAI/1.0 (healthcare navigation; contact via facility portal)",
      },
    }
  );
  if (!nom.ok) throw new AppError("Could not determine your area from GPS.", 502, "GEO_UNAVAILABLE");
  const json = await nom.json();
  return { lat: latitude, lng: longitude, ...normalizeNominatim(json) };
}
