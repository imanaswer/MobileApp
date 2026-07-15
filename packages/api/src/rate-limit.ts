/**
 * App-level rate limiting for sensitive mutations (ADR-025 §2; discharges the
 * M1 "app-level rate limiting deferred to M2+" item). This guards only the
 * surfaces we control — publish/approve/upload-mint procedures. LOGIN is NOT
 * here: auth is client → Supabase direct (never through this API), so Supabase's
 * own OTP/sign-in limits cover it (SECURITY_REVIEW_M1.md).
 *
 * Fixed-window counter, per (key). Keyed by `path:userId` in the transport.
 *
 * ponytail: in-memory, per-process — correct for the single Node container M17
 * deploys (ADR-025 §7). Multi-instance would double the effective limit; swap
 * `buckets` for Redis/Upstash if the app is ever horizontally scaled.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

/** Sensitive mutations (full tRPC path). Publish/approve are the brief's list;
 *  importCsv is here as the one heavy bulk-write endpoint (ADR-027). */
const SENSITIVE_MUTATIONS = new Set([
  "homework.publish",
  "reportCard.publish",
  "reportCard.approve",
  "announcement.publish",
  "document.approve",
  "student.importCsv",
]);

/** Rate-limit config for a procedure path, or null if it isn't limited. */
export function rateLimitFor(path: string): { limit: number; windowMs: number } | null {
  if (SENSITIVE_MUTATIONS.has(path)) return { limit: 20, windowMs: 60_000 };
  // Upload-URL mints (uploadUrl / attachmentUploadUrl / logoUploadUrl); downloads excluded.
  if (path.toLowerCase().endsWith("uploadurl")) return { limit: 30, windowMs: 60_000 };
  return null;
}

/**
 * Returns `true` if the call is allowed (and records it), `false` if the caller
 * has exceeded `limit` within the current `windowMs`. `now` is injectable for tests.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/**
 * Clear all rate-limit counters — the one real in-process cache (M17 ops
 * "cache clear", ADR-025 §9). Returns how many keys were dropped. Lives here (the
 * transport layer owns this cache); authorization is a business `assertSystemManage`.
 */
export function clearRateLimits(): number {
  const cleared = buckets.size;
  buckets.clear();
  return cleared;
}
