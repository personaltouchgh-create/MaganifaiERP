export type AppEnv = "staging" | "production" | "development";

export function getAppEnv(): AppEnv {
  const v = (process.env.APP_ENV ?? "development").toLowerCase();
  if (v === "production") return "production";
  if (v === "staging") return "staging";
  return "development";
}

export function getCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
