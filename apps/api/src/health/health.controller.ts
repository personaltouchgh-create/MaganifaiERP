import { Controller, Get } from "@nestjs/common";
import * as net from "node:net";

function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(1500);

    socket.on("connect", () => {
      done(true);
    });

    socket.on("timeout", () => {
      done(false);
    });

    socket.on("error", () => {
      done(false);
    });
  });
}

function parsePostgres(url: string): { host: string; port: number } | null {
  try {
    const u = new URL(url);
    const port = Number(u.port || "5432");
    return { host: u.hostname, port };
  } catch {
    return null;
  }
}

function parseRedis(url: string): { host: string; port: number } | null {
  try {
    const u = new URL(url);
    const port = Number(u.port || "6379");
    return { host: u.hostname, port };
  } catch {
    return null;
  }
}

@Controller()
export class HealthController {
  @Get("/health")
  health() {
    return { ok: true };
  }

  @Get("/ready")
  async ready() {
    const db = process.env.DATABASE_URL ? parsePostgres(process.env.DATABASE_URL) : null;
    const redis = process.env.REDIS_URL ? parseRedis(process.env.REDIS_URL) : null;

    const dbOk = db ? await canConnect(db.host, db.port) : false;
    const redisOk = redis ? await canConnect(redis.host, redis.port) : false;

    if (!dbOk || !redisOk) return { ok: false, dbOk, redisOk };
    return { ok: true };
  }
}
