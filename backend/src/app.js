import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { apiLimiter } from "./middleware/rateLimiter.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { AppError } from "./utils/errors.js";
import authRoutes from "./routes/auth.routes.js";
import facilityRoutes from "./routes/facility.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import doctorRoutes from "./routes/doctor.routes.js";
import clinicalRoutes from "./routes/clinical.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import miscRoutes from "./routes/misc.routes.js";
import diagnosticRoutes from "./routes/diagnostic.routes.js";
import pharmacyRoutes from "./routes/pharmacy.routes.js";
import procurementRoutes from "./routes/procurement.routes.js";
import mobileRoutes from "./routes/mobile.routes.js";
import aiRoutes from "./routes/ai.routes.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(
    cors({
      origin(origin, callback) {
        // Native apps and server-to-server callers send no Origin header.
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin)) return callback(null, true);
        // Local development only: reflecting an unknown origin while
        // credentials is true would be indistinguishable from a wildcard.
        if (env.permissiveCors) return callback(null, true);
        // 403 rather than a thrown 500: a rejected origin is an expected
        // outcome, not a server fault, and must not spam stack traces.
        return callback(new AppError("Not allowed by CORS", 403, "CORS_REJECTED"));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(apiLimiter);

  app.get("/api/health", (req, res) => res.json({ ok: true, service: "mediconnect-ai-api" }));
  app.use("/api/auth", authRoutes);
  app.use("/api/facilities", facilityRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/doctors", doctorRoutes);
  app.use("/api", clinicalRoutes);
  app.use("/api/analytics", analyticsRoutes);
  app.use("/api/diagnostics", diagnosticRoutes);
  app.use("/api/pharmacy", pharmacyRoutes);
  app.use("/api/procurement", procurementRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api", miscRoutes);
  app.use("/api/mobile", mobileRoutes);
  app.use("/api/ai", aiRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
