import { afterEach, describe, expect, it, vi } from "vitest";
import { createEnvelopeEncryptorFromEnv } from "@repo/security";
import { PaymentsService } from "../src/payments/payments.service";
import type { PrismaService } from "../src/db/prisma.service";

function b64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

function setEnvelopeEnv() {
  process.env.ENVELOPE_ACTIVE_KEY_VERSION = "1";
  process.env.ENVELOPE_MASTER_KEYS_JSON = JSON.stringify({
    1: b64(crypto.getRandomValues(new Uint8Array(32)))
  });
}

async function encryptForTenant(args: { tenantId: string; plaintext: string }) {
  const enc = createEnvelopeEncryptorFromEnv();
  return Buffer.from(await enc.encrypt(new TextEncoder().encode(args.plaintext), args.tenantId));
}

const dec = (v: string) => ({ toString: () => v });

describe("payments verify intent", () => {
  afterEach(() => {
    delete process.env.ENVELOPE_ACTIVE_KEY_VERSION;
    delete process.env.ENVELOPE_MASTER_KEYS_JSON;
  });

  it("marks intent succeeded and creates a single allocation (idempotent)", async () => {
    setEnvelopeEnv();

    const paystackSecretKeyEncrypted = await encryptForTenant({
      tenantId: "t1",
      plaintext: "sk_test_secret"
    });

    const paymentIntentFindFirst = vi.fn().mockResolvedValue({
      id: "pi-1",
      tenantId: "t1",
      branchId: "b1",
      invoiceId: "inv-1",
      amount: dec("20.00"),
      status: "PENDING",
      transactions: [{ id: "pt-1", providerRef: "ref-1", rawPayloadJson: {} }]
    });

    const tenantPaymentSettingsFindUnique = vi.fn().mockResolvedValue({
      paystackEnabled: true,
      paystackSecretKeyEncrypted
    });

    const txFindUnique = vi.fn().mockResolvedValue({
      id: "pt-1",
      tenantId: "t1",
      branchId: "b1",
      providerRef: "ref-1",
      intent: {
        id: "pi-1",
        status: "PENDING",
        invoiceId: "inv-1",
        branchId: "b1",
        amount: dec("20.00")
      }
    });
    const txUpdate = vi.fn();
    const allocationFindFirst = vi.fn().mockResolvedValue(null);
    const allocationCreate = vi.fn();
    const intentUpdate = vi.fn();

    const prismaTx = {
      paymentTransaction: { findUnique: txFindUnique, update: txUpdate },
      paymentAllocation: { findFirst: allocationFindFirst, create: allocationCreate },
      paymentIntent: { update: intentUpdate }
    };

    const prisma = {
      invoice: {},
      paymentIntent: { findFirst: paymentIntentFindFirst, update: intentUpdate },
      tenantPaymentSettings: { findUnique: tenantPaymentSettingsFindUnique, update: vi.fn() },
      paymentTransaction: { update: txUpdate },
      $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prismaTx))
    } as unknown as Pick<
      PrismaService,
      | "$transaction"
      | "invoice"
      | "paymentIntent"
      | "tenantPaymentSettings"
      | "paymentTransaction"
      | "paymentAllocation"
    >;

    const verifyTransaction = vi.fn().mockResolvedValue({
      reference: "ref-1",
      status: "success",
      amount: 2000,
      paid_at: "2026-01-01T00:00:00.000Z"
    });

    const svc = new PaymentsService(prisma, {
      initializeTransaction: vi.fn(),
      verifyTransaction
    });

    const res1 = await svc.verifyIntent({ tenantId: "t1", branchId: "b1", intentId: "pi-1" });
    expect(res1).toMatchObject({ intentId: "pi-1", status: "SUCCEEDED", providerStatus: "success" });
    expect(allocationCreate).toHaveBeenCalledTimes(1);
    expect(intentUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "SUCCEEDED" } }));

    allocationFindFirst.mockResolvedValue({ id: "pa-1" });
    const res2 = await svc.verifyIntent({ tenantId: "t1", branchId: "b1", intentId: "pi-1" });
    expect(res2).toMatchObject({ intentId: "pi-1", status: "SUCCEEDED", providerStatus: "success" });
    expect(allocationCreate).toHaveBeenCalledTimes(1);
  });

  it("marks pending intent failed when provider returns failed", async () => {
    setEnvelopeEnv();

    const paystackSecretKeyEncrypted = await encryptForTenant({
      tenantId: "t1",
      plaintext: "sk_test_secret"
    });

    const paymentIntentFindFirst = vi.fn().mockResolvedValue({
      id: "pi-1",
      tenantId: "t1",
      branchId: "b1",
      invoiceId: "inv-1",
      amount: dec("20.00"),
      status: "PENDING",
      transactions: [{ id: "pt-1", providerRef: "ref-1", rawPayloadJson: {} }]
    });

    const tenantPaymentSettingsFindUnique = vi.fn().mockResolvedValue({
      paystackEnabled: true,
      paystackSecretKeyEncrypted
    });

    const txFindUnique = vi.fn().mockResolvedValue({
      id: "pt-1",
      intent: { id: "pi-1", status: "PENDING" }
    });
    const txUpdate = vi.fn();
    const intentUpdate = vi.fn();

    const prismaTx = {
      paymentTransaction: { findUnique: txFindUnique, update: txUpdate },
      paymentIntent: { update: intentUpdate }
    };

    const prisma = {
      invoice: {},
      paymentIntent: { findFirst: paymentIntentFindFirst },
      tenantPaymentSettings: { findUnique: tenantPaymentSettingsFindUnique },
      paymentTransaction: { update: txUpdate },
      $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prismaTx))
    } as unknown as Pick<
      PrismaService,
      | "$transaction"
      | "invoice"
      | "paymentIntent"
      | "tenantPaymentSettings"
      | "paymentTransaction"
      | "paymentAllocation"
    >;

    const verifyTransaction = vi.fn().mockResolvedValue({
      reference: "ref-1",
      status: "failed",
      amount: 2000,
      paid_at: null
    });

    const svc = new PaymentsService(prisma, {
      initializeTransaction: vi.fn(),
      verifyTransaction
    });

    const res = await svc.verifyIntent({ tenantId: "t1", branchId: "b1", intentId: "pi-1" });
    expect(res).toMatchObject({ intentId: "pi-1", providerStatus: "failed" });
    expect(intentUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "FAILED" } }));
  });
});
