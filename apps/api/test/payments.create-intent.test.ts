import { afterEach, describe, expect, it, vi } from "vitest";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
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
  return Buffer.from(
    await enc.encrypt(new TextEncoder().encode(args.plaintext), args.tenantId)
  );
}

const dec = (v: string) => ({ toString: () => v });

describe("payments create intent", () => {
  afterEach(() => {
    delete process.env.ENVELOPE_ACTIVE_KEY_VERSION;
    delete process.env.ENVELOPE_MASTER_KEYS_JSON;
    delete process.env.PAYSTACK_API_BASE_URL;
  });

  it("rejects amount below min partial when balance due is higher", async () => {
    setEnvelopeEnv();

    const paystackSecretKeyEncrypted = await encryptForTenant({
      tenantId: "t1",
      plaintext: "sk_test_secret"
    });

    const invoiceFindFirst = vi.fn().mockResolvedValue({
      id: "inv-1",
      tenantId: "t1",
      branchId: "b1",
      totalAmount: dec("100.00")
    });
    const allocationFindMany = vi.fn().mockResolvedValue([]);
    const settingsFindUnique = vi.fn().mockResolvedValue({
      tenantId: "t1",
      paystackEnabled: true,
      channelsMomo: true,
      channelsCard: true,
      minPartialAmountGhs: dec("10.00"),
      paystackSecretKeyEncrypted
    });
    const intentFindFirst = vi.fn().mockResolvedValue(null);
    const intentCreate = vi.fn();
    const transactionCreate = vi.fn();

    const prisma = {
      invoice: { findFirst: invoiceFindFirst },
      paymentAllocation: { findMany: allocationFindMany },
      tenantPaymentSettings: { findUnique: settingsFindUnique },
      paymentIntent: { findFirst: intentFindFirst, create: intentCreate },
      paymentTransaction: { create: transactionCreate },
      $transaction: vi.fn()
    } as unknown as Pick<
      PrismaService,
      | "$transaction"
      | "invoice"
      | "paymentAllocation"
      | "tenantPaymentSettings"
      | "paymentIntent"
      | "paymentTransaction"
    >;

    const initializeTransaction = vi.fn();
    const paystack = { initializeTransaction, verifyTransaction: vi.fn() };

    const svc = new PaymentsService(prisma, paystack);

    await expect(
      svc.createIntent({
        tenantId: "t1",
        branchId: "b1",
        invoiceId: "inv-1",
        amountGhs: "9.00",
        channel: "MOMO",
        idempotencyKey: "idem-1",
        customerEmail: "customer@example.com",
        callbackUrl: "https://example.com/callback",
        createdByUserId: "u1"
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(initializeTransaction).not.toHaveBeenCalled();
    expect(intentCreate).not.toHaveBeenCalled();
    expect(transactionCreate).not.toHaveBeenCalled();
  });

  it("caps requested amount at balance due and creates a single transaction with providerRef", async () => {
    setEnvelopeEnv();

    const paystackSecretKeyEncrypted = await encryptForTenant({
      tenantId: "t1",
      plaintext: "sk_test_secret"
    });

    const invoiceFindFirst = vi.fn().mockResolvedValue({
      id: "inv-1",
      tenantId: "t1",
      branchId: "b1",
      totalAmount: dec("100.00")
    });
    const allocationFindMany = vi.fn().mockResolvedValue([{ amount: dec("30.00") }]);
    const settingsFindUnique = vi.fn().mockResolvedValue({
      tenantId: "t1",
      paystackEnabled: true,
      channelsMomo: true,
      channelsCard: true,
      minPartialAmountGhs: dec("10.00"),
      paystackSecretKeyEncrypted
    });
    const intentFindFirst = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const intentCreate = vi.fn().mockResolvedValue({
      id: "pi-1",
      tenantId: "t1",
      branchId: "b1",
      invoiceId: "inv-1"
    });
    const transactionCreate = vi.fn().mockResolvedValue({ id: "pt-1" });

    const prisma = {
      invoice: { findFirst: invoiceFindFirst },
      paymentAllocation: { findMany: allocationFindMany },
      tenantPaymentSettings: { findUnique: settingsFindUnique },
      paymentIntent: { findFirst: intentFindFirst, create: intentCreate },
      paymentTransaction: { create: transactionCreate },
      $transaction: vi.fn()
    } as unknown as Pick<
      PrismaService,
      | "$transaction"
      | "invoice"
      | "paymentAllocation"
      | "tenantPaymentSettings"
      | "paymentIntent"
      | "paymentTransaction"
    >;

    const initializeTransaction = vi.fn().mockResolvedValue({
      authorization_url: "https://paystack/redirect",
      access_code: "ac-1",
      reference: "ref-1"
    });
    const paystack = { initializeTransaction, verifyTransaction: vi.fn() };

    const svc = new PaymentsService(prisma, paystack);

    const res = await svc.createIntent({
      tenantId: "t1",
      branchId: "b1",
      invoiceId: "inv-1",
      amountGhs: "120.00",
      channel: "MOMO",
      idempotencyKey: "idem-1",
      customerEmail: "customer@example.com",
      callbackUrl: "https://example.com/callback",
      createdByUserId: "u1"
    });

    expect(invoiceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t1", branchId: "b1", id: "inv-1" }
      })
    );

    const intentCreateArg = intentCreate.mock.calls[0]?.[0] as unknown as {
      data: Record<string, unknown>;
    };
    expect(intentCreateArg.data).toMatchObject({
      tenantId: "t1",
      branchId: "b1",
      invoiceId: "inv-1",
      amount: "70.00",
      channel: "MOMO",
      status: "PENDING",
      idempotencyKey: "idem-1"
    });

    const initArg = initializeTransaction.mock.calls[0]?.[0] as unknown as {
      amountPesewas: number;
    };
    expect(initArg.amountPesewas).toBe(7000);

    const txCreateArg = transactionCreate.mock.calls[0]?.[0] as unknown as {
      data: Record<string, unknown>;
    };
    expect(txCreateArg.data).toMatchObject({
      tenantId: "t1",
      branchId: "b1",
      provider: "PAYSTACK",
      providerRef: "ref-1"
    });

    expect(res).toMatchObject({
      intentId: "pi-1",
      authorizationUrl: "https://paystack/redirect",
      reference: "ref-1",
      amount: "70.00"
    });
  });

  it("enforces single pending intent per invoice (different idempotency key)", async () => {
    setEnvelopeEnv();

    const paystackSecretKeyEncrypted = await encryptForTenant({
      tenantId: "t1",
      plaintext: "sk_test_secret"
    });

    const invoiceFindFirst = vi.fn().mockResolvedValue({
      id: "inv-1",
      tenantId: "t1",
      branchId: "b1",
      totalAmount: dec("100.00")
    });
    const allocationFindMany = vi.fn().mockResolvedValue([]);
    const settingsFindUnique = vi.fn().mockResolvedValue({
      tenantId: "t1",
      paystackEnabled: true,
      channelsMomo: true,
      channelsCard: true,
      minPartialAmountGhs: dec("10.00"),
      paystackSecretKeyEncrypted
    });
    const intentFindFirst = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "pi-existing",
      status: "PENDING",
      invoiceId: "inv-1"
    });
    const intentCreate = vi.fn();
    const transactionCreate = vi.fn();

    const prisma = {
      invoice: { findFirst: invoiceFindFirst },
      paymentAllocation: { findMany: allocationFindMany },
      tenantPaymentSettings: { findUnique: settingsFindUnique },
      paymentIntent: { findFirst: intentFindFirst, create: intentCreate },
      paymentTransaction: { create: transactionCreate },
      $transaction: vi.fn()
    } as unknown as Pick<
      PrismaService,
      | "$transaction"
      | "invoice"
      | "paymentAllocation"
      | "tenantPaymentSettings"
      | "paymentIntent"
      | "paymentTransaction"
    >;

    const initializeTransaction = vi.fn();
    const paystack = { initializeTransaction, verifyTransaction: vi.fn() };

    const svc = new PaymentsService(prisma, paystack);

    await expect(
      svc.createIntent({
        tenantId: "t1",
        branchId: "b1",
        invoiceId: "inv-1",
        amountGhs: "20.00",
        channel: "MOMO",
        idempotencyKey: "idem-new",
        customerEmail: "customer@example.com",
        callbackUrl: "https://example.com/callback",
        createdByUserId: "u1"
      })
    ).rejects.toBeInstanceOf(ConflictException);

    expect(initializeTransaction).not.toHaveBeenCalled();
    expect(intentCreate).not.toHaveBeenCalled();
  });

  it("is idempotent by tenant+idempotencyKey and returns existing intent/transaction", async () => {
    setEnvelopeEnv();

    const paystackSecretKeyEncrypted = await encryptForTenant({
      tenantId: "t1",
      plaintext: "sk_test_secret"
    });

    const invoiceFindFirst = vi.fn().mockResolvedValue({
      id: "inv-1",
      tenantId: "t1",
      branchId: "b1",
      totalAmount: dec("100.00")
    });
    const allocationFindMany = vi.fn().mockResolvedValue([]);
    const settingsFindUnique = vi.fn().mockResolvedValue({
      tenantId: "t1",
      paystackEnabled: true,
      channelsMomo: true,
      channelsCard: true,
      minPartialAmountGhs: dec("10.00"),
      paystackSecretKeyEncrypted
    });
    const intentFindFirst = vi.fn().mockResolvedValue({
      id: "pi-1",
      tenantId: "t1",
      branchId: "b1",
      invoiceId: "inv-1",
      amount: dec("20.00"),
      status: "PENDING",
      transactions: [
        {
          providerRef: "ref-1",
          rawPayloadJson: {
            authorization_url: "https://paystack/redirect",
            access_code: "ac-1",
            reference: "ref-1"
          }
        }
      ]
    });
    const intentCreate = vi.fn();
    const transactionCreate = vi.fn();

    const prisma = {
      invoice: { findFirst: invoiceFindFirst },
      paymentAllocation: { findMany: allocationFindMany },
      tenantPaymentSettings: { findUnique: settingsFindUnique },
      paymentIntent: { findFirst: intentFindFirst, create: intentCreate },
      paymentTransaction: { create: transactionCreate },
      $transaction: vi.fn()
    } as unknown as Pick<
      PrismaService,
      | "$transaction"
      | "invoice"
      | "paymentAllocation"
      | "tenantPaymentSettings"
      | "paymentIntent"
      | "paymentTransaction"
    >;

    const initializeTransaction = vi.fn();
    const paystack = { initializeTransaction, verifyTransaction: vi.fn() };

    const svc = new PaymentsService(prisma, paystack);

    const res = await svc.createIntent({
      tenantId: "t1",
      branchId: "b1",
      invoiceId: "inv-1",
      amountGhs: "20.00",
      channel: "MOMO",
      idempotencyKey: "idem-1",
      customerEmail: "customer@example.com",
      callbackUrl: "https://example.com/callback",
      createdByUserId: "u1"
    });

    expect(initializeTransaction).not.toHaveBeenCalled();
    expect(intentCreate).not.toHaveBeenCalled();
    expect(transactionCreate).not.toHaveBeenCalled();
    expect(res).toMatchObject({
      intentId: "pi-1",
      authorizationUrl: "https://paystack/redirect",
      reference: "ref-1",
      amount: "20.00"
    });
  });

  it("scopes invoice lookup to tenant+branch and throws NotFound when invoice is in a different branch", async () => {
    setEnvelopeEnv();

    const paystackSecretKeyEncrypted = await encryptForTenant({
      tenantId: "t1",
      plaintext: "sk_test_secret"
    });

    const invoiceFindFirst = vi.fn().mockResolvedValue(null);
    const allocationFindMany = vi.fn();
    const settingsFindUnique = vi.fn().mockResolvedValue({
      tenantId: "t1",
      paystackEnabled: true,
      channelsMomo: true,
      channelsCard: true,
      minPartialAmountGhs: dec("10.00"),
      paystackSecretKeyEncrypted
    });
    const intentFindFirst = vi.fn();
    const intentCreate = vi.fn();
    const transactionCreate = vi.fn();

    const prisma = {
      invoice: { findFirst: invoiceFindFirst },
      paymentAllocation: { findMany: allocationFindMany },
      tenantPaymentSettings: { findUnique: settingsFindUnique },
      paymentIntent: { findFirst: intentFindFirst, create: intentCreate },
      paymentTransaction: { create: transactionCreate },
      $transaction: vi.fn()
    } as unknown as Pick<
      PrismaService,
      | "$transaction"
      | "invoice"
      | "paymentAllocation"
      | "tenantPaymentSettings"
      | "paymentIntent"
      | "paymentTransaction"
    >;

    const initializeTransaction = vi.fn();
    const paystack = { initializeTransaction, verifyTransaction: vi.fn() };

    const svc = new PaymentsService(prisma, paystack);

    await expect(
      svc.createIntent({
        tenantId: "t1",
        branchId: "b1",
        invoiceId: "inv-other-branch",
        amountGhs: "20.00",
        channel: "MOMO",
        idempotencyKey: "idem-1",
        customerEmail: "customer@example.com",
        callbackUrl: "https://example.com/callback",
        createdByUserId: "u1"
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
