import { describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { PermissionGuard } from "../src/auth/auth.guard";
import type { AuthRequest } from "../src/auth/auth.guard";
import { PaymentsController } from "../src/payments/payments.controller";
import type { PaymentsService } from "../src/payments/payments.service";

describe("payments controller", () => {
  it("declares RBAC guard on create intent", () => {
    const createMethod: unknown = Object.getOwnPropertyDescriptor(
      PaymentsController.prototype,
      "createIntent"
    )?.value;

    const guards = Reflect.getMetadata(GUARDS_METADATA, createMethod as object) as
      | unknown[]
      | undefined;

    expect(guards?.[0]).toBeInstanceOf(PermissionGuard);
    expect((guards?.[0] as { permission: string }).permission).toBe("PAYMENTS.INTENTS.CREATE");
  });

  it("declares RBAC guard on verify intent", () => {
    const verifyMethod: unknown = Object.getOwnPropertyDescriptor(
      PaymentsController.prototype,
      "verifyIntent"
    )?.value;

    const guards = Reflect.getMetadata(GUARDS_METADATA, verifyMethod as object) as
      | unknown[]
      | undefined;

    expect(guards?.[0]).toBeInstanceOf(PermissionGuard);
    expect((guards?.[0] as { permission: string }).permission).toBe("PAYMENTS.INTENTS.CREATE");
  });

  it("rejects when missing branchId", async () => {
    const svc = {
      createIntent: vi.fn<PaymentsService["createIntent"]>()
    } satisfies Pick<PaymentsService, "createIntent">;

    const controller = new PaymentsController(svc as unknown as PaymentsService);

    const req: AuthRequest = {
      headers: {},
      auth: {
        tenantId: "t1",
        branchId: null,
        userId: "u1",
        rolePermissions: ["PAYMENTS.INTENTS.CREATE"],
        userGrants: [],
        requestId: "req-1"
      }
    };

    await expect(
      controller.createIntent(req, {
        invoiceId: "inv-1",
        amount: "10.00",
        channel: "MOMO",
        idempotencyKey: "idem-1",
        email: "customer@example.com",
        callbackUrl: "https://example.com/callback"
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
