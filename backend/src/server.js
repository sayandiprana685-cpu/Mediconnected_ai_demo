import { env } from "./config/env.js";
import { connectDb } from "./config/db.js";
import { initRedis, redisStatus } from "./config/redis.js";
import { createApp } from "./app.js";
import { startAiQueue } from "./services/ai.service.js";
import { verifySMTPConnection } from "./services/email.service.js";

const app = createApp();

connectDb()
  .then(async () => {
    // Redis is an optimisation, never a dependency: if it is absent the AI
    // cache and burst queue fall back to in-process equivalents and the API
    // still answers triage requests.
    await initRedis().catch((err) => console.warn("[redis] init failed", err.message));
    const redis = redisStatus();
    console.log(`Redis ${redis.connected ? "connected" : `unavailable (${redis.error || "not configured"})`}`);

    // Verify SMTP once at startup — diagnostic only, never blocks startup.
    verifySMTPConnection();

    app.listen(env.port, () => {
      console.log(`MediConnect AI API listening on ${env.port}`);
      // Start draining only once we are serving: replayed jobs write to Mongo
      // and call the Python service, so they need the app fully up.
      startAiQueue();
    });
  })
  .catch((err) => {
    console.error("Failed to start", err);
    process.exit(1);
  });
