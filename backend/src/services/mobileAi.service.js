import { env } from "../config/env.js";
import { searchAll } from "./mobileDiscovery.service.js";

const NAV_TOOLS = [
  { name: "findDoctors", screen: "Doctors", description: "Find doctors near the user." },
  { name: "findClinics", screen: "Clinics", description: "Find clinics." },
  { name: "findHospitals", screen: "Hospitals", description: "Find hospitals." },
  { name: "findNursingHomes", screen: "NursingHomes", description: "Find nursing homes." },
  { name: "findPharmacies", screen: "Pharmacies", description: "Find pharmacies and medicine shops." },
  { name: "findLabs", screen: "Labs", description: "Find laboratories." },
  { name: "findDiagnosticCenters", screen: "Diagnostics", description: "Find diagnostic centres." },
  { name: "searchMedicine", screen: "Medicines", description: "Search medicines and pharmacies that stock them." },
  { name: "findNearbyServices", screen: "Nearby", description: "Show nearby healthcare providers." },
  { name: "openPrescriptions", screen: "Prescriptions", description: "Open the user's prescriptions." },
  { name: "openHealthRecords", screen: "HealthRecords", description: "Open health records." },
  { name: "openReports", screen: "Reports", description: "Open diagnostic and facility reports." },
  { name: "trackOrder", screen: "Orders", description: "Track medicine orders." },
  { name: "openEmergency", screen: "Emergency", description: "Open emergency help (never auto-dial)." },
  { name: "openProfile", screen: "Profile", description: "Open profile and settings." },
  { name: "openMessages", screen: "Messages", description: "Open messages with providers." },
];

const EMERGENCY_PATTERNS =
  /\b(chest pain|can't breathe|cannot breathe|not breathing|unconscious|severe bleeding|suicide|stroke|heart attack|seizure|poison)\b/i;

export async function runPatientAi({ message, history = [], patient, query }) {
  const text = String(message || "").trim();
  if (!text) return { text: "Please tell me what you need help with.", actions: [], speak: true };

  if (EMERGENCY_PATTERNS.test(text)) {
    return {
      text: "This may be an emergency. I cannot diagnose you. Please use Emergency in the app to call for help, or go to the nearest hospital now. I will not place a call unless you confirm it.",
      actions: [{ type: "navigate", screen: "Emergency", tool: "openEmergency" }],
      speak: true,
      safety: "emergency",
    };
  }

  if (env.aiApiUrl && env.aiApiKey) {
    try {
      const remote = await callRemoteAi({ text, history, tools: NAV_TOOLS });
      if (remote?.text) return remote;
    } catch (err) {
      if (env.node === "development") console.error("[ai] provider failed, using local navigator", err.message);
    }
  }

  const intent = detectIntent(text);
  let extra = "";
  let searchPreview = null;
  if (intent.searchQ) {
    const found = await searchAll({ query: { ...query, q: intent.searchQ, limit: 5 }, patient });
    searchPreview = found.groups;
    const n = (found.results || []).length;
    extra = n
      ? ` I found ${n} matching result${n === 1 ? "" : "s"} in your area.`
      : " I could not find a match in your district yet. You can try another search or another town in the same district.";
  }

  return {
    text: `${intent.reply}${extra} I am a healthcare navigation helper, not a doctor. I do not diagnose illness.`,
    actions: intent.actions,
    speak: true,
    searchPreview,
    tool: intent.tool,
  };
}

function detectIntent(text) {
  const t = text.toLowerCase();
  const pairs = [
    { re: /nursing home/, tool: "findNursingHomes", screen: "NursingHomes", reply: "I can show nursing homes near you." },
    { re: /diagnostic|scan|x-?ray|ultrasound/, tool: "findDiagnosticCenters", screen: "Diagnostics", reply: "I can help you find a diagnostic centre." },
    { re: /lab|blood test|patholog/, tool: "findLabs", screen: "Labs", reply: "I can help you find a laboratory for tests." },
    { re: /pharmacy|medicine shop|chemist|drug store/, tool: "findPharmacies", screen: "Pharmacies", reply: "I can show pharmacies near you." },
    { re: /hospital/, tool: "findHospitals", screen: "Hospitals", reply: "I can show hospitals near you." },
    { re: /clinic/, tool: "findClinics", screen: "Clinics", reply: "I can show clinics near you." },
    { re: /doctor|physician|consult/, tool: "findDoctors", screen: "Doctors", reply: "I can help you find a doctor. Would you like to see doctors near you?" },
    { re: /prescription/, tool: "openPrescriptions", screen: "Prescriptions", reply: "I can open your prescriptions." },
    { re: /report|lab result/, tool: "openReports", screen: "Reports", reply: "I can open your reports." },
    { re: /health record|my records/, tool: "openHealthRecords", screen: "HealthRecords", reply: "I can open your health records." },
    { re: /order|track/, tool: "trackOrder", screen: "Orders", reply: "I can open your medicine orders." },
    { re: /emergency|ambulance|sos/, tool: "openEmergency", screen: "Emergency", reply: "I can open Emergency. I will not call anyone until you confirm." },
    { re: /fever|cough|pain|where (should|do) i go/, tool: "findClinics", screen: "Clinics", reply: "I can help you find a nearby clinic or doctor. Would you like me to show clinics near you?" },
    { re: /medicine|tablet|syrup/, tool: "searchMedicine", screen: "Medicines", reply: "I can search medicines and nearby pharmacies." },
    { re: /message|chat/, tool: "openMessages", screen: "Messages", reply: "I can open your messages." },
    { re: /profile|account|logout|language/, tool: "openProfile", screen: "Profile", reply: "I can open your profile and settings." },
  ];
  for (const p of pairs) {
    if (p.re.test(t)) {
      const searchQ = p.tool.startsWith("find") || p.tool === "searchMedicine" ? guessQuery(t) : null;
      return {
        tool: p.tool,
        actions: [{ type: "navigate", screen: p.screen, tool: p.tool, params: searchQ ? { q: searchQ } : {} }],
        reply: p.reply,
        searchQ: p.tool === "searchMedicine" ? extractMedicine(t) : searchQ,
      };
    }
  }
  return {
    tool: "findNearbyServices",
    actions: [{ type: "navigate", screen: "Search", tool: "findNearbyServices", params: { q: text } }],
    reply: "I can search nearby healthcare services for you.",
    searchQ: text,
  };
}

function guessQuery(t) {
  if (/blood test/.test(t)) return "blood";
  if (/pharmacy/.test(t)) return "pharmacy";
  return "";
}

function extractMedicine(t) {
  const m = t.replace(/where can i get|i need|show me|find/gi, "").replace(/this medicine|medicine/gi, "").trim();
  return m.slice(0, 80);
}

async function callRemoteAi({ text, history, tools }) {
  const res = await fetch(env.aiApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.aiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are MediConnected AI, a healthcare navigation assistant for a mobile app in rural India. You help people find doctors, clinics, hospitals, labs, pharmacies, and their own records. You do not diagnose. You do not claim certainty. For emergencies you tell the user to use Emergency in the app and never auto-dial. Reply in simple English. When you want the app to open a screen, include a JSON block like {\"screen\":\"Hospitals\"} at the end. Available screens: Doctors, Clinics, Hospitals, NursingHomes, Pharmacies, Labs, Diagnostics, Medicines, Nearby, Prescriptions, HealthRecords, Reports, Orders, Emergency, Profile, Messages, Search.",
        },
        ...history.slice(-8).map((h) => ({ role: h.role, content: h.content })),
        { role: "user", content: text },
      ],
      tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: { type: "object", properties: {} } } })),
    }),
  });
  if (!res.ok) throw new Error(`AI HTTP ${res.status}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || data.output_text || "";
  const screenMatch = content.match(/"screen"\s*:\s*"(\w+)"/);
  return {
    text: content.replace(/```[\s\S]*```/g, "").replace(/\{[^{}]*"screen"[^{}]*\}/g, "").trim(),
    actions: screenMatch ? [{ type: "navigate", screen: screenMatch[1] }] : [],
    speak: true,
    provider: "remote",
  };
}

export { NAV_TOOLS };
