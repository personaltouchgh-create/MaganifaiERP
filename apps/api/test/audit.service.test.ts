import { describe, expect, it, vi } from "vitest";
import { AuditService } from "../src/audit/audit.service";
import type { PrismaService } from "../src/db/prisma.service";

describe("audit service", () => {
  it("writes AuditLog via PrismaService", async () => {
    const create = vi.fn<(arg: unknown) => Promise<unknown>>().mockResolvedValue({});
    const prisma = {
      auditLog: { create } as unknown as PrismaService["auditLog"]
    } as Pick<PrismaService, "auditLog">;
    const service = new AuditService(prisma);

    const occurredAt = new Date("2026-01-01T00:00:00.000Z").toISOString();
    await service.write({
      tenantId: "t1",
      branchId: "b1",
      actorUserId: "u1",
      action: "TEST",
      entityType: "TENANT",
      entityId: "t1",
      idempotencyKey: "idem-1",
      requestId: "req-1",
      occurredAt,
      metadata: { ok: true }
    });

    const [call] = create.mock.calls;
    const arg0 = call?.[0];
    expect(arg0).toBeDefined();
    const arg = arg0 as {
      data: {
        tenantId: string;
        branchId: string | null;
        actorUserId: string;
        action: string;
        entityType: string;
        entityId: string;
        idempotencyKey: string;
        requestId: string;
        occurredAt: Date;
        metadata: Record<string, unknown>;
      };
    };

    expect(arg.data).toMatchObject({
      tenantId: "t1",
      branchId: "b1",
      actorUserId: "u1",
      action: "TEST",
      entityType: "TENANT",
      entityId: "t1",
      idempotencyKey: "idem-1",
      requestId: "req-1",
      metadata: { ok: true }
    });
    expect(arg.data.occurredAt).toEqual(new Date(occurredAt));
  });
});
