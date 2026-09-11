import { env } from "../config/env.js";
import { getRedis } from "../config/redis.js";

// Caches recent AI responses so that an identical request inside a short window
// is answered from memory instead of re-running Whisper or the classifier. This
// matters most offline-first: a phone that retries a sync three times must not
// cause three transcriptions of the same audio.
//
// Redis is used when it is up; otherwise a bounded in-process Map takes over so
// behaviour degrades to "no shared cache" rather than "no cache at all".

const KEY_PREFIX = "ai:";
const MEMORY_MAX_ENTRIES = 500;

/** @type {Map<string, {value: unknown, expiresAt: number}>} */
const memory = new Map();

function memoryGet(key) {
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memory.delete(key);
    return null;
  }
  // Re-inserting moves the key to the end, which is what makes the eviction
  // below least-recently-used rather than oldest-inserted.
  memory.delete(key);
  memory.set(key, entry);
  return entry.value;
}

function memorySet(key, value, ttlSeconds) {
  if (memory.size >= MEMORY_MAX_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export function triageCacheKey(requestId) {
  return `${KEY_PREFIX}triage:${requestId}`;
}

export function riskCacheKey(domain, requestId) {
  return `${KEY_PREFIX}risk:${String(domain).toLowerCase()}:${requestId}`;
}

/**
 * Read a cached AI response. Returns null on a miss AND on any Redis failure,
 * because a cache that can throw would turn an optimisation into an outage.
 */
export async function cacheGet(key) {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (raw) return JSON.parse(raw);
      return null;
    } catch (err) {
      if (env.node === "development") console.error("[ai-cache] get failed", err.message);
      return memoryGet(key);
    }
  }
  return memoryGet(key);
}

export async function cacheSet(key, value, ttlSeconds = env.ai.cacheTtlSeconds) {
  if (ttlSeconds <= 0) return false;
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
      return true;
    } catch (err) {
      if (env.node === "development") console.error("[ai-cache] set failed", err.message);
    }
  }
  memorySet(key, value, ttlSeconds);
  return true;
}

export function cacheStatus() {
  return {
    backend: getRedis() ? "redis" : "in-process",
    ttlSeconds: env.ai.cacheTtlSeconds,
    memoryEntries: memory.size,
  };
}
