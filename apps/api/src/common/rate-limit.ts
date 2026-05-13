import type { Request, Response, NextFunction } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimit(opts: { windowMs: number; max: number }) {
  return function (req: Request, res: Response, next: NextFunction) {
    const ip = typeof req.ip === "string" ? req.ip : "unknown";
    const key = `${ip}:${req.path}`;
    const now = Date.now();
    const b = buckets.get(key);

    if (!b || now > b.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }

    b.count += 1;

    if (b.count > opts.max) {
      res.status(429).json({ error: "rate_limited" });
      return;
    }

    next();
  };
}
