/**
 * Lightweight In-Memory Sliding-Window Rate Limiter for Next.js API Routes.
 * Protects sensitive endpoints (recovery, token minting, messaging, reactions)
 * against brute-force attacks and flood spam without external dependencies.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Prune stale entries every 5 mins

function pruneStaleEntries(now: number, maxWindowMs: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const cutoff = now - Math.max(maxWindowMs, 15 * 60 * 1000);
  store.forEach((entry, key) => {
    entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  });
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Checks whether a request keyed by `key` is within `maxRequests` per `windowMs`.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  pruneStaleEntries(now, windowMs);

  const windowStart = now - windowMs;
  const existing = store.get(key);
  const timestamps = existing
    ? existing.timestamps.filter((ts) => ts > windowStart)
    : [];

  if (timestamps.length >= maxRequests) {
    const oldestInWindow = timestamps[0] || now;
    const retryAfterMs = Math.max(1000, oldestInWindow + windowMs - now);
    store.set(key, { timestamps });
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  timestamps.push(now);
  store.set(key, { timestamps });

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - timestamps.length),
    retryAfterSeconds: 0,
  };
}

/**
 * Extracts the client IP from proxy and platform headers.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;
  return "unknown";
}
