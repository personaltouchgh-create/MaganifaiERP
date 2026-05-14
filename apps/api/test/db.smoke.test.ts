import { describe, expect, it } from "vitest";

describe("db", () => {
  it("exposes PrismaService", async () => {
    const mod = await import("../src/db/prisma.service");
    expect(mod.PrismaService).toBeTypeOf("function");
  });
});
