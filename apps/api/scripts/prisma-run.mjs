import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Missing prisma args");
  process.exit(1);
}

const cacheDir = process.env.CACHE_DIR ?? path.resolve(process.cwd(), ".cache");

if (process.platform === "win32") {
  const cmd = process.env.ComSpec ?? "cmd.exe";
  const esc = (a) => {
    const needsQuotes = /[\s"]/u.test(a);
    const v = a.replaceAll('"', '\\"');
    return needsQuotes ? `"${v}"` : v;
  };
  const cmdline = ["pnpm", "exec", "prisma", ...args].map(esc).join(" ");
  execFileSync(cmd, ["/d", "/s", "/c", cmdline], {
    stdio: "inherit",
    env: { ...process.env, CACHE_DIR: cacheDir }
  });
} else {
  execFileSync("pnpm", ["exec", "prisma", ...args], {
    stdio: "inherit",
    env: { ...process.env, CACHE_DIR: cacheDir }
  });
}

process.exit(0);
