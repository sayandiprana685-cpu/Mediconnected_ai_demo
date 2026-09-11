import { env } from "../config/env.js";
import { getRedis } from "../config/redis.js";

// Burst queue for the connectivity-spike case: when a health camp comes back
// online, two hundred phones sync at once. Requests that the AI service cannot
// take right now (timeout, 503, or anything flagged X-Retryable) are parked
// here and replayed at a controlled rate instead of all failing together.
//
// Deliberately not BullMQ - a Redis list plus a drain loop is enough for this
// workload and adds no dependency to a deployment that may run on one small box.

const QUEUE_KEY = "ai:queue:pending";
const MAX_CONCURRENCY = 4;
const MAX_TRIES = 3;
const IDLE_POLL_MS = 5000;

const memoryQueue = [];
let handler = null;
let inFlight = 0;
let draining = false;
let timer = null;
const stats = { enqueued: 0, completed: 0, failed: 0, dropped: 0 };

function logError(scope, err) {
  if (env.node === "development") console.error(`[ai-queue] ${scope}`, err.message);
}

async function push(job) {
  const redis = getRedis();
  if (redis) {
    try {
      const depth = await redis.llen(QUEUE_KEY);
      if (depth >= env.ai.maxQueued) return false;
      await redis.rpush(QUEUE_KEY, JSON.stringify(job));
      return true;
    } catch (err) {
      logError("push failed", err);
    }
  }
  if (memoryQueue.length >= env.ai.maxQueued) return false;
  memoryQueue.push(job);
  return true;
}

async function pop() {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.lpop(QUEUE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      logError("pop failed", err);
    }
  }
  return memoryQueue.length ? memoryQueue.shift() : null;
}

export async function queueDepth() {
  const redis = getRedis();
  if (redis) {
    try {
      return await redis.llen(QUEUE_KEY);
    } catch {
      /* fall through to the in-process count */
    }
  }
  return memoryQueue.length;
}

export function queueStatus() {
  return {
    backend: getRedis() ? "redis" : "in-process",
    maxQueued: env.ai.maxQueued,
    maxConcurrency: MAX_CONCURRENCY,
    maxTries: MAX_TRIES,
    inFlight,
    ...stats,
  };
}

/**
 * Park a job for later replay. Returns false when the queue is full, which the
 * caller should surface as "try again later" rather than silently discarding.
 */
export async function enqueue(kind, payload) {
  const accepted = await push({ kind, payload, tries: 0, queuedAt: Date.now() });
  if (accepted) {
    stats.enqueued += 1;
    scheduleDrain();
  }
  return accepted;
}

/**
 * Register the replay handler and start draining. Called once from server boot.
 * The handler returns normally on success and throws on failure; an error
 * carrying `retryable === false` drops the job instead of re-queuing it.
 */
export function startDrain(fn) {
  handler = fn;
  scheduleDrain();
}

export function stopDrain() {
  if (timer) clearTimeout(timer);
  timer = null;
  handler = null;
}

function scheduleDrain() {
  if (!handler || draining || timer) return;
  timer = setTimeout(() => {
    timer = null;
    drainCycle().catch((err) => logError("drain cycle failed", err));
  }, 250);
}

async function drainCycle() {
  if (draining) return;
  draining = true;
  try {
    // Keep pulling while there is spare concurrency, so the AI service sees at
    // most MAX_CONCURRENCY replays at a time no matter how large the spike was.
    while (inFlight < MAX_CONCURRENCY) {
      const job = await pop();
      if (!job) break;
      inFlight += 1;
      runJob(job).finally(() => {
        inFlight -= 1;
        scheduleDrain();
      });
    }
  } finally {
    draining = false;
  }

  const remaining = (await queueDepth()) + inFlight;
  if (remaining > 0) {
    scheduleDrain();
  } else if (!timer) {
    // Nothing left to do; check back periodically in case a job arrives while
    // no drain is scheduled.
    timer = setTimeout(() => {
      timer = null;
      scheduleDrain();
    }, IDLE_POLL_MS);
  }
}

async function requeueLater(job) {
  const delayMs = 2000 * job.tries;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  await push(job);
  scheduleDrain();
}

async function runJob(job) {
  job.tries = (job.tries || 0) + 1;
  try {
    await handler(job);
    stats.completed += 1;
    return;
  } catch (err) {
    if (err?.retryable === false || job.tries >= MAX_TRIES) {
      stats.dropped += 1;
      const detail = err?.message || String(err);
      console.error(`[ai-queue] dropping ${job.kind} after ${job.tries} tries: ${detail}`);
      return;
    }
    stats.failed += 1;
    requeueLater(job).catch((e) => logError("requeue failed", e));
  }
}
