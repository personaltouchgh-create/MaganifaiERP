import { describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import type { AuditEvent } from "@repo/security";
import type { AuditService } from "../src/audit/audit.service";
import type { AuthRequest } from "../src/auth/auth.guard";
import { PaymentSettingsController } from "../src/tenants/payment-settings.controller";
import { PermissionGuard } from "../src/auth/auth.guard";
import type { PaymentSettingsService } from "../src/tenants/payment-settings.service";

describe("payment settings controller", () => {
  it("declares RBAC guards on GET/PUT", () => {
    const getMethod: unknown = Object.getOwnPropertyDescriptor(
      PaymentSettingsController.prototype,
      "get"
    )?.value;
    const putMethod: unknown = Object.getOwnPropertyDescriptor(
      PaymentSettingsController.prototype,
      "put"
    )?.value;

    const getGuards = Reflect.getMetadata(GUARDS_METADATA, getMethod as object) as
      | unknown[]
      | undefined;
    const putGuards = Reflect.getMetadata(GUARDS_METADATA, putMethod as object) as
      | unknown[]
      | undefined;

    expect(getGuards?.[0]).toBeInstanceOf(PermissionGuard);
    expect((getGuards?.[0] as { permission: string }).permission).toBe(
      "SETTINGS.PAYMENTS.VIEW"
    );

    expect(putGuards?.[0]).toBeInstanceOf(PermissionGuard);
    expect((putGuards?.[0] as { permission: string }).permission).toBe(
      "SETTINGS.PAYMENTS.EDIT"
    );
  });

  it("rejects cross-tenant access", async () => {
    const svc = {
      getPublic: vi.fn<PaymentSettingsService["getPublic"]>().mockResolvedValue(null),
      upsert: vi.fn<PaymentSettingsService["upsert"]>()
    } satisfies Pick<PaymentSettingsService, "getPublic" | "upsert">;
    const audit = {
      write: vi.fn<AuditService["write"]>()
    } satisfies Pick<AuditService, "write">;

    const controller = new PaymentSettingsController(
      svc as unknown as PaymentSettingsService,
      audit as unknown as AuditService
    );

    const req: AuthRequest = {
      headers: {},
      auth: {
        tenantId: "t1",
        branchId: null,
        userId: "u1",
        rolePermissions: [],
        userGrants: [],
        requestId: "req-1"
      }
    };

    await expect(
      controller.get("t2", req)
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("writes audit log on update and never returns secrets", async () => {
    type UpsertArgs = Parameters<PaymentSettingsService["upsert"]>[0];
    const svc = {
      upsert: vi.fn<(args: UpsertArgs) => Promise<void>>().mockResolvedValue(undefined),
      getPublic: vi.fn<PaymentSettingsService["getPublic"]>().mockResolvedValue({
        tenantId: "t1",
        paystackEnabled: true,
        channels: { momo: true, card: false },
        minPartialAmountGhs: "1.00",
        paystackPublicKey: "pk_test",
        webhookLastSeenAt: null,
        webhookLastStatus: null
      })
    } satisfies Pick<PaymentSettingsService, "getPublic"> & { upsert: (args: UpsertArgs) => Promise<void> };
    const audit = {
      write: vi.fn<(e: AuditEvent) => Promise<void>>().mockResolvedValue(undefined)
    } satisfies Pick<AuditService, "write">;

    const controller = new PaymentSettingsController(
      svc as unknown as PaymentSettingsService,
      audit as unknown as AuditService
    );

    const req: AuthRequest = {
      headers: {},
      auth: {
        tenantId: "t1",
        branchId: null,
        userId: "u1",
        rolePermissions: ["SETTINGS.PAYMENTS.EDIT"],
        userGrants: [],
        requestId: "req-1"
      }
    };
    const res = await controller.put(
      "t1",
      req,
      {
        paystackEnabled: true,
        channelsMomo: true,
        channelsCard: false,
        minPartialAmountGhs: "1.00",
        paystackPublicKey: "pk_test",
        paystackSecretKey: "sk_test_secret",
        paystackWebhookSecret: "whsec_test_secret",
        idempotencyKey: "idem-1"
      }
    );

    expect(res).toMatchObject({
      tenantId: "t1",
      paystackEnabled: true
    });
    expect(res).not.toHaveProperty("paystackSecretKey");
    expect(res).not.toHaveProperty("paystackWebhookSecret");

    expect(audit.write).toHaveBeenCalledTimes(1);
    const event = audit.write.mock.calls[0]?.[0];
    expect(event).toBeDefined();
    expect(event).toMatchObject({
      tenantId: "t1",
      actorUserId: "u1",
      idempotencyKey: "idem-1",
      requestId: "req-1",
      action: "TENANT_PAYMENT_SETTINGS.UPDATE"
    });
    expect(event?.metadata).toMatchObject({
      paystackEnabled: true,
      channelsMomo: true,
      channelsCard: false,
      minPartialAmountGhs: "1.00",
      paystackPublicKeySet: true,
      paystackSecretKeyReplaced: true,
      paystackWebhookSecretReplaced: true
    });
  });
});
