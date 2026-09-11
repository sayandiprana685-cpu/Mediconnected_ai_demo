import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// The provider SPA and this API deploy to sibling *.onrender.com hosts, and
// onrender.com is on the Public Suffix List — so they are separate *sites*, not
// merely separate origins, and a SameSite=Lax cookie is never attached to the
// SPA's cross-site fetch() calls. Render does not reliably set NODE_ENV, so the
// hosted deployment is detected from its RENDER marker as well.
const isHostedProd = process.env.NODE_ENV === "production" || process.env.RENDER === "true";

// SameSite=None is rejected by browsers unless the cookie is also Secure, so
// these two attributes must always move together.
const crossSiteCookies = process.env.COOKIE_SAMESITE
  ? process.env.COOKIE_SAMESITE.trim().toLowerCase() === "none"
  : isHostedProd;

export const env = {
  node: process.env.NODE_ENV || "development",
  isProd: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT || 5000),
  clientUrl: process.env.CLIENT_URL || "http://127.0.0.1:5173",
  corsOrigins: [
    process.env.CLIENT_URL,
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "https://mediconncet-ai-provider-management.onrender.com",
    ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : []),
  ]
    .filter(Boolean)
    // A browser Origin header never carries a trailing slash, so a CLIENT_URL
    // configured as "https://host/" would otherwise never match.
    .map((s) => s.trim().replace(/\/+$/, "")),
  cookie: {
    sameSite: crossSiteCookies ? "none" : "lax",
    secure: crossSiteCookies,
  },
  // Reflecting an unknown origin while credentials:true is equivalent to a
  // wildcard, so this convenience is local development only.
  permissiveCors: !isHostedProd,
  authCookieDebug: ["1", "true", "yes"].includes(
    String(process.env.AUTH_COOKIE_DEBUG || "").trim().toLowerCase()
  ),
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/mediconnect_ai",
  aiApiUrl: process.env.AI_API_URL || "",
  aiApiKey: process.env.AI_API_KEY || "",
  mapsApiKey: process.env.MAPS_API_KEY || "",
  voiceApiUrl: process.env.VOICE_API_URL || "",
  voiceApiKey: process.env.VOICE_API_KEY || "",
  // Python triage/risk microservice (D:\curser\ai-model). Kept separate from
  // aiApiUrl above, which mobileAi.service.js already uses for the chat
  // navigator's LLM call - they are different services with different auth.
  ai: {
    baseUrl: String(process.env.AI_TRIAGE_API_URL || "").replace(/\/+$/, ""),
    serviceKey: process.env.AI_TRIAGE_API_KEY || "",
    timeoutMs: Number(process.env.AI_TRIAGE_TIMEOUT_MS || 15000),
    voiceTimeoutMs: Number(process.env.AI_VOICE_TIMEOUT_MS || 60000),
    cacheTtlSeconds: Number(process.env.AI_TRIAGE_CACHE_TTL || 300),
    maxQueued: Number(process.env.AI_QUEUE_MAX || 500),
    maxVoiceBytes: Number(process.env.AI_VOICE_MAX_BYTES || 10 * 1024 * 1024),
    // Lets the scheduled re-scoring job call this backend without a user JWT.
    cronKey: process.env.AI_CRON_KEY || "",
  },
  redis: {
    url: process.env.REDIS_URL || "",
    connectTimeoutMs: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 2000),
  },
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "dev-access-secret",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret",
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES || "15m",
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES || "7d",
  inviteHours: Number(process.env.INVITE_TOKEN_EXPIRES_HOURS || 72),
  otpMinutes: Number(process.env.OTP_EXPIRES_MINUTES || 10),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
  appTz: process.env.APP_TZ || "Asia/Kolkata",
  medicineExpiryWarningDays: Number(process.env.MEDICINE_EXPIRY_WARNING_DAYS || 30),
  email: {
    host: process.env.EMAIL_HOST || "",
    port: Number(process.env.EMAIL_PORT || 587),
    user: process.env.EMAIL_USER || "",
    password: process.env.EMAIL_PASSWORD || "",
    from: process.env.EMAIL_FROM || "MediConnect AI <noreply@mediconnect.ai>",
  },
};
