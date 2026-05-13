export interface AuditEvent {
  tenantId: string;
  branchId: string | null;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  idempotencyKey: string;
  requestId: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

