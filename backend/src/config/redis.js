import { env } from "./env.js";

// Redis is an optimisation, never a dependency. A rural deployment may run this
// API on a single box with no Redis at all, and a field device must still get a
// triage answer. So the client is created lazily, connects in the background,
// and every consumer treats `getRedis()` returning null as "use the in-process
// fallback" rather than an error.

let client = null;
let loadError = null;
let initStarted = false;

/**
 * Begin connecting to Redis. Safe to call more than once; resolves as soon as
 * the connection attempt has been made, whether or not it succeeded.
 */
export async function initRedis() {
  if (initStarted) return redisStatus();
  initStarted = true;

  if (!env.redis.url) {
    loadError = "REDIS_URL is not set";
    return redisStatus();
  }

  try {
    const { default: Redis } = await import("ioredis");
    client = new Redis(env.redis.url, {
      lazyConnect: true,
      connectTimeout: env.redis.connectTimeoutMs,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 200, 3000),
    });

    client.on("error", (err) => {
      // Without this listener ioredis throws unhandled errors and can take the
      // process down, which is the opposite of what a cache should do.
      if (env.node === "development") console.error("[redis] error", err.message);
      loadError = err.message;
    });

    await client.connect();
    loadError = null;
    console.log("Redis connected");
  } catch (err) {
    loadError = err.message;
    client = null;
    console.warn(`[redis] unavailable, falling back to in-process cache: ${err.message}`);
  }

  return redisStatus();
}

/** The live client, or null when Redis is absent or not currently connected. */
export function getRedis() {
  return client && client.status === "ready" ? client : null;
}

export function redisStatus() {
  return {
    configured: Boolean(env.redis.url),
    connected: Boolean(getRedis()),
    state: client?.status || "none",
    error: loadError,
  };
}

export async function closeRedis() {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
  client = null;
}
