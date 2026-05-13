import { spawnSync } from "node:child_process";

const POSTGRES_USER = process.env.POSTGRES_USER ?? "postgres";
const POSTGRES_DB = process.env.POSTGRES_DB ?? "pharmacy";

const r = spawnSync(
  "docker",
  [
    "compose",
    "exec",
    "-T",
    "postgres",
    "psql",
    "-h",
    "localhost",
    "-U",
    POSTGRES_USER,
    "-d",
    POSTGRES_DB,
    "-f",
    "/seed/seed.sql"
  ],
  { stdio: "inherit" }
);

process.exit(r.status ?? 1);