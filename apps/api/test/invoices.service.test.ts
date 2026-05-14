import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { InvoicesService } from "../src/invoices/invoices.service";

const dec = (v: string) => ({ toString: () => v });

describe("invoices service", () => {
  it("computes paidAmount and balanceDue from allocations for portal bills", async () => {
    const prisma = {
      invoice: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "inv-1",
            tenantId: "t1",
            branchId: "b1",
            invoiceNumber: "INV-001",
            currency: "GHS",
            totalAmount: dec("100.00"),
            status: "OPEN",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
            allocations: [{ amount: dec("30.00") }, { amount: dec("0.50") }],
            intents: [
              {
                id: "pi-1",
                amount: dec("30.50"),
                channel: "MOMO",
                status: "SUCCEEDED",
                idempotencyKey: "idem-1",
                createdFrom: "PORTAL",
                createdByUserId: "u1",
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
                updatedAt: new Date("2026-01-01T00:00:00.000Z"),
                transactions: [
                  {
                    id: "pt-1",
                    provider: "PAYSTACK",
                    providerRef: "ref-1",
                    providerStatus: "success",
                    paidAt: new Date("2026-01-01T00:00:00.000Z"),
                    createdAt: new Date("2026-01-01T00:00:00.000Z")
                  }
                ]
              }
            ]
          }
        ])
      }
    };

    const svc = new InvoicesService(
      prisma as unknown as ConstructorParameters<typeof InvoicesService>[0]
    );
    const res = await svc.getPortalBills({ tenantId: "t1", branchId: "b1" });

    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t1", branchId: "b1" }
      })
    );

    expect(res).toMatchObject({
      invoices: [
        {
          id: "inv-1",
          totalAmount: "100.00",
          paidAmount: "30.50",
          balanceDue: "69.50"
        }
      ]
    });
  });

  it("scopes invoice payments lookup to tenantId+branchId and throws NotFound when missing", async () => {
    const prisma = {
      invoice: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    };

    const svc = new InvoicesService(
      prisma as unknown as ConstructorParameters<typeof InvoicesService>[0]
    );

    await expect(
      svc.getInvoicePayments({ tenantId: "t1", branchId: "b1", invoiceId: "inv-404" })
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t1", branchId: "b1", id: "inv-404" }
      })
    );
  });
});
