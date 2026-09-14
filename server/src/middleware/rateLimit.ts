import type { RequestHandler } from "express";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export const rateLimit: RequestHandler = (req, res, next) => {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) buckets.set(key, { count: 1, resetAt: now + 5 * 60_000 });
  else bucket.count += 1;
  const current = buckets.get(key)!;
  res.setHeader("x-rate-limit-remaining", Math.max(0, 30 - current.count));
  if (current.count > 30) {
    res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." } });
    return;
  }
  next();
};
