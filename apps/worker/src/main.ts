import { Worker } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const APP_ENV = process.env.APP_ENV ?? "development";

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

const worker = new Worker(
  "default",
  async (job) => {
    if (APP_ENV !== "production") process.stdout.write(`job ${job.name} ${job.id ?? "unknown"}\n`);
    await Promise.resolve();
    return { ok: true };
  },
  { connection }
);

worker.on("failed", (job, err) => {
  process.stderr.write(`job failed ${job?.id ?? "unknown"}: ${err.message}\n`);
});

process.on("SIGTERM", () => {
  void (async () => {
    await worker.close();
    await connection.quit();
    process.exit(0);
  })();
});