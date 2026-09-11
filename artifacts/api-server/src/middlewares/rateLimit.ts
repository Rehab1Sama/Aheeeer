import { Request, Response, NextFunction } from "express";

// Simple in-memory, fixed-window rate limiter. No new dependency required.
//
// NOTE: this state is per-process. If the API is ever scaled to multiple
// instances behind a load balancer, move this to a shared store (e.g. Redis)
// so limits are enforced across all instances. For a single-instance
// deployment (as configured in render.yaml today) this is sufficient and a
// large improvement over having no limiting at all.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodic cleanup so the map doesn't grow unbounded.
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 5 * 60 * 1000);
cleanupTimer.unref();

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]!.trim();
  }
  return req.socket?.remoteAddress ?? "unknown";
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
  /** Include the request body's `email` field in the bucket key (per-account limiting). */
  byEmail?: boolean;
}

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max, keyPrefix, byEmail } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = clientIp(req);
    const emailPart =
      byEmail && typeof req.body?.email === "string"
        ? req.body.email.toLowerCase().trim()
        : "";
    const key = `${keyPrefix}:${ip}:${emailPart}`;
    const now = Date.now();

    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (bucket.count >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({ error: "عدد كبير جدًا من المحاولات، يرجى الانتظار قليلًا ثم إعادة المحاولة" });
      return;
    }

    bucket.count += 1;
    next();
  };
}
