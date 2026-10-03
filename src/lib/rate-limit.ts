/**
 * Simple sliding-window rate limiter.
 *
 * NOTE: This in-memory implementation is per-process. It works for a
 * single-instance dev/staging deployment. For production with more
 * than one app instance, replace the store below with Redis (the
 * REDIS_URL is already provisioned in .env.example) so limits are
 * shared across instances — see docs/ARCHITECTURE.md.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: maxAttempts - 1 };
  }

  if (bucket.count >= maxAttempts) {
    return { allowed: false, remaining: 0 };
  }

  bucket.count += 1;
  return { allowed: true, remaining: maxAttempts - bucket.count };
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
