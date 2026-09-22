import { NextResponse } from "next/server";

/**
 * Best-effort in-memory rate limiter for the AI parsing routes (parse-*, cipl/extract).
 *
 * CAVEAT: state lives in this Node process's memory, not a shared store. On Vercel
 * serverless, a cold start or a second concurrent instance gets its own empty map, so
 * this does not enforce an exact global limit — it only throttles bursts landing on the
 * same warm instance. That is enough to stop a runaway client-side loop or a stuck retry
 * from hammering the Gemini API bill; it is not a substitute for a shared store (e.g.
 * Upstash Redis) if an exact cross-instance limit is ever required.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Drops expired buckets so a long-lived warm instance doesn't grow the map forever. */
function prune(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may retry. Only set when `allowed` is false. */
  retryAfterSeconds?: number;
}

/** Fixed-window limiter: at most `limit` calls per `windowMs` for a given `key`. */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (buckets.size > 1000) prune(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (existing.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }

  existing.count += 1;
  return { allowed: true };
}

/** Only for tests: clears all buckets so cases don't leak state into each other. */
export function _resetRateLimitState(): void {
  buckets.clear();
}

// ─── AI parsing routes (parse-*, cipl/extract) ────────────────────────────────
// Each call is a Gemini request (billed) and/or an OCR pass — generous enough for a
// sales admin batch-processing several RFQs in a row, tight enough to stop a loop.
export const AI_ROUTE_LIMIT = 20;
export const AI_ROUTE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export function checkAiRouteLimit(userId: string): RateLimitResult {
  return checkRateLimit(`ai:${userId}`, AI_ROUTE_LIMIT, AI_ROUTE_WINDOW_MS);
}

/** Standard 429 JSON response for a rejected `checkRateLimit`/`checkAiRouteLimit` call. */
export function rateLimitResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: `Bạn đang gửi yêu cầu quá nhanh. Vui lòng thử lại sau ${retryAfterSeconds} giây.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}
