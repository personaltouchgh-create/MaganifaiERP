import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { createEnvelopeEncryptorFromEnv } from "@repo/security";
import type { PrismaService } from "../db/prisma.service";
import type { Prisma } from "../generated/prisma/client";
import type { PaystackInitResponse } from "./paystack/paystack.client";
import type { PaystackVerifyResponse } from "./paystack/paystack.client";
import type { PaystackClient } from "./paystack/paystack.client";

function moneyToCents(amount: string): bigint {
  const s = amount.trim();
  if (!s.length) throw new Error("Invalid money");
  const neg = s.startsWith("-");
  const raw = neg ? s.slice(1) : s;
  const [wholeRaw = "0", fracRaw = ""] = raw.split(".");
  if (!/^\d+$/.test(wholeRaw || "0")) throw new Error("Invalid money");
  if (fracRaw && !/^\d+$/.test(fracRaw)) throw new Error("Invalid money");
  const whole = wholeRaw.length ? BigInt(wholeRaw) : 0n;
  const frac = BigInt((fracRaw + "00").slice(0, 2));
  const cents = whole * 100n + frac;
  return neg ? -cents : cents;
}

function centsToMoney(cents: bigint): string {
  const neg = cents < 0n;
  const raw = neg ? -cents : cents;
  const whole = raw / 100n;
  const frac = raw % 100n;
  const out = `${whole.toString()}.${frac.toString().padStart(2, "0")}`;
  return neg ? `-${out}` : out;
}

function clampMin0(v: bigint) {
  return v < 0n ? 0n : v;
}

function sumAmounts(rows: { amount: { toString(): string } }[]): bigint {
  return rows.reduce((acc, r) => acc + moneyToCents(r.amount.toString()), 0n);
}

function bigintToSafeNumber(v: bigint) {
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Amount too large");
  if (v < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error("Amount too small");
  return Number(v);
}

async function decryptSecretKey(args: { tenantId: string; encrypted: Uint8Array }) {
  const enc = createEnvelopeEncryptorFromEnv();
  return new TextDecoder().decode(await enc.decrypt(args.encrypted, args.tenantId));
}

interface ExistingIntent {
  id: string;
  tenantId: string;
  branchId: string;
  invoiceId: string;
  amount: { toString(): string };
  status: string;
  transactions: {
    id: string;
    providerRef: string;
    rawPayloadJson: unknown;
  }[];
}

function pickInitFromRaw(raw: unknown): PaystackInitResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const authorization_url = r.authorization_url;
  const access_code = r.access_code;
  const reference = r.reference;
  if (
    typeof authorization_url === "string" &&
    typeof access_code === "string" &&
    typeof reference === "string"
  ) {
    return { authorization_url, access_code, reference };
  }
  return null;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: Pick<
      PrismaService,
      | "$transaction"
      | "invoice"
      | "paymentAllocation"
      | "tenantPaymentSettings"
      | "paymentIntent"
      | "paymentTransaction"
    >,
    private readonly paystack: Pick<PaystackClient, "initializeTransaction" | "verifyTransaction">
  ) {}

  private async upsertSuccessByTransaction(args: {
    tenantId: string;
    providerRef: string;
    providerStatus: string;
    paidAt: Date | null;
    rawPayloadJson: unknown;
  }) {
    await this.prisma.$transaction(async (tx) => {
      const row = (await tx.paymentTransaction.findUnique({
        where: { tenantId_providerRef: { tenantId: args.tenantId, providerRef: args.providerRef } },
        include: {
          intent: {
            select: { id: true, status: true, invoiceId: true, branchId: true, amount: true }
          }
        }
      })) as unknown as
        | {
            id: string;
            tenantId: string;
            branchId: string;
            providerRef: string;
            intent: {
              id: string;
              status: string;
              invoiceId: string;
              branchId: string;
              amount: { toString(): string };
            };
          }
        | null;

      if (!row) return;

      await tx.paymentTransaction.update({
        where: { id: row.id },
        data: {
          providerStatus: args.providerStatus,
          paidAt: args.paidAt,
          rawPayloadJson: args.rawPayloadJson as Prisma.InputJsonValue
        }
      });

      const existingAllocation = await tx.paymentAllocation.findFirst({
        where: {
          tenantId: args.tenantId,
          invoiceId: row.intent.invoiceId,
          paymentTransactionId: row.id
        },
        select: { id: true }
      });

      if (!existingAllocation) {
        await tx.paymentAllocation.create({
          data: {
            tenantId: args.tenantId,
            branchId: row.intent.branchId,
            invoiceId: row.intent.invoiceId,
            paymentTransactionId: row.id,
            amount: row.intent.amount.toString()
          }
        });
      }

      if (row.intent.status !== "SUCCEEDED") {
        await tx.paymentIntent.update({
          where: { id: row.intent.id },
          data: { status: "SUCCEEDED" }
        });
      }
    });
  }

  private async upsertFailureByTransaction(args: {
    tenantId: string;
    providerRef: string;
    providerStatus: string;
    rawPayloadJson: unknown;
  }) {
    await this.prisma.$transaction(async (tx) => {
      const row = (await tx.paymentTransaction.findUnique({
        where: { tenantId_providerRef: { tenantId: args.tenantId, providerRef: args.providerRef } },
        include: { intent: { select: { id: true, status: true } } }
      })) as unknown as
        | { id: string; intent: { id: string; status: string } }
        | null;

      if (!row) return;

      await tx.paymentTransaction.update({
        where: { id: row.id },
        data: {
          providerStatus: args.providerStatus,
          rawPayloadJson: args.rawPayloadJson as Prisma.InputJsonValue
        }
      });

      if (row.intent.status === "PENDING") {
        await tx.paymentIntent.update({
          where: { id: row.intent.id },
          data: { status: "FAILED" }
        });
      }
    });
  }

  async createIntent(args: {
    tenantId: string;
    branchId: string;
    invoiceId: string;
    amountGhs: string;
    channel: "MOMO" | "CARD";
    idempotencyKey: string;
    customerEmail: string;
    callbackUrl: string;
    createdByUserId: string;
    createdFrom?: "PORTAL" | "ERP";
  }): Promise<{
    intentId: string;
    authorizationUrl: string;
    reference: string;
    amount: string;
  }> {
    const existing = (await this.prisma.paymentIntent.findFirst({
      where: { tenantId: args.tenantId, idempotencyKey: args.idempotencyKey },
      include: { transactions: { orderBy: { createdAt: "desc" } } }
    })) as unknown as ExistingIntent | null;

    if (existing) {
      if (existing.invoiceId !== args.invoiceId || existing.branchId !== args.branchId) {
        throw new ConflictException("Idempotency key already used");
      }
      const tx = existing.transactions[0];
      const init = pickInitFromRaw(tx?.rawPayloadJson ?? null);
      if (!tx || !init) throw new ConflictException("Existing intent missing provider transaction");
      return {
        intentId: existing.id,
        authorizationUrl: init.authorization_url,
        reference: init.reference,
        amount: existing.amount.toString()
      };
    }

    const inv = (await this.prisma.invoice.findFirst({
      where: { tenantId: args.tenantId, branchId: args.branchId, id: args.invoiceId },
      select: { id: true, tenantId: true, branchId: true, totalAmount: true }
    })) as unknown as
      | { id: string; tenantId: string; branchId: string; totalAmount: { toString(): string } }
      | null;

    if (!inv) throw new NotFoundException("Invoice not found");

    const settings = (await this.prisma.tenantPaymentSettings.findUnique({
      where: { tenantId: args.tenantId },
      select: {
        paystackEnabled: true,
        channelsMomo: true,
        channelsCard: true,
        minPartialAmountGhs: true,
        paystackSecretKeyEncrypted: true
      }
    })) as unknown as
      | {
          paystackEnabled: boolean;
          channelsMomo: boolean;
          channelsCard: boolean;
          minPartialAmountGhs: { toString(): string };
          paystackSecretKeyEncrypted: Buffer | null;
        }
      | null;

    if (!settings?.paystackEnabled) throw new BadRequestException("Paystack not enabled");
    if (args.channel === "MOMO" && !settings.channelsMomo) throw new BadRequestException("MoMo not enabled");
    if (args.channel === "CARD" && !settings.channelsCard) throw new BadRequestException("Card not enabled");
    if (!settings.paystackSecretKeyEncrypted) throw new BadRequestException("Paystack secret missing");

    const secretKey = await decryptSecretKey({
      tenantId: args.tenantId,
      encrypted: new Uint8Array(settings.paystackSecretKeyEncrypted)
    });

    const allocations = (await this.prisma.paymentAllocation.findMany({
      where: { tenantId: args.tenantId, invoiceId: inv.id, branchId: inv.branchId },
      select: { amount: true }
    })) as unknown as { amount: { toString(): string } }[];

    const totalCents = moneyToCents(inv.totalAmount.toString());
    const paidCents = sumAmounts(allocations);
    const balanceCents = clampMin0(totalCents - paidCents);
    if (balanceCents === 0n) throw new BadRequestException("Invoice has no balance due");

    let requestedCents: bigint;
    try {
      requestedCents = moneyToCents(args.amountGhs);
    } catch {
      throw new BadRequestException("Invalid amount");
    }
    if (requestedCents <= 0n) throw new BadRequestException("Invalid amount");

    const payCents = requestedCents > balanceCents ? balanceCents : requestedCents;
    const minCents = moneyToCents(settings.minPartialAmountGhs.toString());

    if (payCents < minCents && payCents !== balanceCents) {
      throw new BadRequestException("Below minimum partial amount");
    }

    const existingPending = await this.prisma.paymentIntent.findFirst({
      where: { tenantId: args.tenantId, invoiceId: inv.id, status: "PENDING" },
      select: { id: true }
    });
    if (existingPending) throw new ConflictException("Pending payment already exists for invoice");

    const amount = centsToMoney(payCents);

    const intent = await this.prisma.paymentIntent.create({
      data: {
        tenantId: args.tenantId,
        branchId: inv.branchId,
        invoiceId: inv.id,
        amount,
        channel: args.channel,
        status: "PENDING",
        idempotencyKey: args.idempotencyKey,
        createdFrom: args.createdFrom ?? "PORTAL",
        createdByUserId: args.createdByUserId
      },
      select: { id: true }
    });

    const init = await this.paystack.initializeTransaction({
      secretKey,
      email: args.customerEmail,
      amountPesewas: bigintToSafeNumber(payCents),
      callbackUrl: args.callbackUrl,
      metadata: {
        tenantId: args.tenantId,
        branchId: inv.branchId,
        invoiceId: inv.id,
        intentId: intent.id
      }
    });

    await this.prisma.paymentTransaction.create({
      data: {
        tenantId: args.tenantId,
        branchId: inv.branchId,
        paymentIntentId: intent.id,
        provider: "PAYSTACK",
        providerRef: init.reference,
        providerStatus: "initialized",
        rawPayloadJson: init
      }
    });

    return {
      intentId: intent.id,
      authorizationUrl: init.authorization_url,
      reference: init.reference,
      amount
    };
  }

  async verifyIntent(args: {
    tenantId: string;
    branchId: string;
    intentId: string;
  }): Promise<{ intentId: string; status: string; providerStatus: string }> {
    const intent = (await this.prisma.paymentIntent.findFirst({
      where: { tenantId: args.tenantId, branchId: args.branchId, id: args.intentId },
      include: { transactions: { orderBy: { createdAt: "desc" } } }
    })) as unknown as ExistingIntent | null;

    if (!intent) throw new NotFoundException("Payment intent not found");
    const tx = intent.transactions[0];
    if (!tx) throw new NotFoundException("Payment transaction not found");

    const settings = (await this.prisma.tenantPaymentSettings.findUnique({
      where: { tenantId: args.tenantId },
      select: { paystackEnabled: true, paystackSecretKeyEncrypted: true }
    })) as unknown as { paystackEnabled: boolean; paystackSecretKeyEncrypted: Buffer | null } | null;

    if (!settings?.paystackEnabled) throw new BadRequestException("Paystack not enabled");
    if (!settings.paystackSecretKeyEncrypted) throw new BadRequestException("Paystack secret missing");

    const secretKey = await decryptSecretKey({
      tenantId: args.tenantId,
      encrypted: new Uint8Array(settings.paystackSecretKeyEncrypted)
    });

    let verified: PaystackVerifyResponse;
    try {
      verified = await this.paystack.verifyTransaction({ secretKey, reference: tx.providerRef });
    } catch {
      throw new ServiceUnavailableException("Payment provider unavailable");
    }

    const providerStatus = verified.status;
    const paidAtRaw = verified.paid_at ? new Date(verified.paid_at) : null;
    const paidAt = paidAtRaw && !Number.isNaN(paidAtRaw.valueOf()) ? paidAtRaw : null;

    if (providerStatus === "success") {
      await this.upsertSuccessByTransaction({
        tenantId: args.tenantId,
        providerRef: tx.providerRef,
        providerStatus,
        paidAt,
        rawPayloadJson: verified
      });
      return { intentId: intent.id, status: "SUCCEEDED", providerStatus };
    }

    if (providerStatus === "failed" || providerStatus === "abandoned") {
      await this.upsertFailureByTransaction({
        tenantId: args.tenantId,
        providerRef: tx.providerRef,
        providerStatus,
        rawPayloadJson: verified
      });
      return { intentId: intent.id, status: intent.status === "PENDING" ? "FAILED" : intent.status, providerStatus };
    }

    await this.prisma.paymentTransaction.update({
      where: { id: tx.id },
      data: { providerStatus, rawPayloadJson: verified as unknown as Prisma.InputJsonValue }
    });

    return { intentId: intent.id, status: intent.status, providerStatus };
  }

  async handlePaystackWebhook(args: {
    tenantId: string;
    event: string;
    data: unknown;
    rawPayloadJson: unknown;
  }): Promise<void> {
    const providerRef =
      args.data && typeof args.data === "object" ? (args.data as Record<string, unknown>).reference : undefined;
    if (typeof providerRef !== "string" || !providerRef) return;

    const providerStatus =
      args.data && typeof args.data === "object" ? (args.data as Record<string, unknown>).status : undefined;
    const status = typeof providerStatus === "string" ? providerStatus : args.event;
    const paidAtRaw =
      args.data && typeof args.data === "object" ? (args.data as Record<string, unknown>).paid_at : undefined;
    const paidAtDate = typeof paidAtRaw === "string" ? new Date(paidAtRaw) : null;
    const paidAt = paidAtDate && !Number.isNaN(paidAtDate.valueOf()) ? paidAtDate : null;

    if (args.event === "charge.success" || status === "success") {
      await this.upsertSuccessByTransaction({
        tenantId: args.tenantId,
        providerRef,
        providerStatus: status,
        paidAt,
        rawPayloadJson: args.rawPayloadJson
      });
      return;
    }

    if (args.event === "charge.failed" || status === "failed" || status === "abandoned") {
      await this.upsertFailureByTransaction({
        tenantId: args.tenantId,
        providerRef,
        providerStatus: status,
        rawPayloadJson: args.rawPayloadJson
      });
    }
  }
}
