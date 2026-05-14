import { Injectable } from "@nestjs/common";
import type { AuditEvent } from "@repo/security";
import { PrismaService } from "../db/prisma.service";
import type { Prisma } from "../generated/prisma/client";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: Pick<PrismaService, "auditLog">) {}

  async write(e: AuditEvent) {
    await this.prisma.auditLog.create({
      data: {
        tenantId: e.tenantId,
        branchId: e.branchId,
        actorUserId: e.actorUserId,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        idempotencyKey: e.idempotencyKey,
        requestId: e.requestId,
        occurredAt: new Date(e.occurredAt),
        metadata: e.metadata as unknown as Prisma.InputJsonValue
      }
    });
  }
}
