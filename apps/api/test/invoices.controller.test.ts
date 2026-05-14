import { describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import type { AuthRequest } from "../src/auth/auth.guard";
import { PermissionGuard } from "../src/auth/auth.guard";
import { InvoicesController } from "../src/invoices/invoices.controller";
import type { InvoicesService } from "../src/invoices/invoices.service";

describe("invoices controller", () => {
  it("declares RBAC guards on GET /portal/bills and GET /invoices/:invoiceId/payments", () => {
    const portalBillsMethod: unknown = Object.getOwnPropertyDescriptor(
      InvoicesController.prototype,
      "getPortalBills"
    )?.value;
    const invoicePaymentsMethod: unknown = Object.getOwnPropertyDescriptor(
      InvoicesController.prototype,
      "getInvoicePayments"
    )?.value;

    const portalGuards = Reflect.getMetadata(GUARDS_METADATA, portalBillsMethod as object) as
      | unknown[]
      | undefined;
    const paymentsGuards = Reflect.getMetadata(GUARDS_METADATA, invoicePaymentsMethod as object) as
      | unknown[]
      | undefined;

    expect(portalGuards?.[0]).toBeInstanceOf(PermissionGuard);
    expect((portalGuards?.[0] as { permission: string }).permission).toBe("PORTAL.BILLS.VIEW");

    expect(paymentsGuards?.[0]).toBeInstanceOf(PermissionGuard);
    expect((paymentsGuards?.[0] as { permission: string }).permission).toBe(
      "INVOICES.PAYMENTS.VIEW"
    );
  });

  it("requires branchId in auth context", async () => {
    const svc = {
      getPortalBills: vi.fn<InvoicesService["getPortalBills"]>(),
      getInvoicePayments: vi.fn<InvoicesService["getInvoicePayments"]>()
    } satisfies Pick<InvoicesService, "getPortalBills" | "getInvoicePayments">;

    const controller = new InvoicesController(svc as unknown as InvoicesService);

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

    await expect(controller.getPortalBills(req)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.getInvoicePayments("inv-1", req)).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });
});

