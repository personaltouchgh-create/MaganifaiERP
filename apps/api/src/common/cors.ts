import { getCorsOrigins } from "./env";

export function corsOrigin(
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean) => void
) {
  const allowlist = getCorsOrigins();

  if (!origin) {
    cb(null, true);
    return;
  }

  if (allowlist.length === 0) {
    cb(null, false);
    return;
  }

  cb(null, allowlist.includes(origin));
}
