import type { Request, Response, NextFunction } from "express";
import { getAppEnv } from "./env";

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");

  const appEnv = getAppEnv();
  const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
  if (isHttps && (appEnv === "production" || appEnv === "staging")) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  next();
}
