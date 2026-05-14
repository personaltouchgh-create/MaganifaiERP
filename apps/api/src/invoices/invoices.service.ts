import { Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaService } from "../db/prisma.service";

function moneyToCents(amount: string): bigint {
  const s = amount.trim();
  const neg = s.startsWith("-");
  const raw = neg ? s.slice(1) : s;
  const [wholeRaw = "0", fracRaw = ""] = raw.split(".");
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

function sumAmounts(rows: { amount: { toString(): string } }[]): bigint {
  return rows.reduce((acc, r) => acc + moneyToCents(r.amount.toString()), 0n);
}

function clampMin0(v: bigint) {
  return v < 0n ? 0n : v;
}

interface InvoiceQueryResult {
  id: string;
  tenantId: string;
  branchId: string;
  invoiceNumber: string;
  currency: string;
  totalAmount: { toString(): string };
  status: string;
  createdAt: Date;
  updatedAt: Date;
  allocations: { amount: { toString(): string } }[];
  intents: {
    id: string;
    amount: { toString(): string };
    channel: string;
    status: string;
    idempotencyKey: string;
    createdFrom: string;
    createdByUserId: string;
    createdAt: Date;
    updatedAt: Date;
    transactions: {
      id: string;
      provider: string;
      providerRef: string;
      providerStatus: string;
      paidAt: Date | null;
      createdAt: Date;
    }[];
  }[];
}

export interface PortalBillsResponse {
  invoices: {
    id: string;
    invoiceNumber: string;
    currency: string;
    totalAmount: string;
    paidAmount: string;
    balanceDue: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    intents: {
      id: string;
      amount: string;
      channel: string;
      status: string;
      idempotencyKey: string;
      createdFrom: string;
      createdByUserId: string;
      createdAt: string;
      updatedAt: string;
      transactions: {
        id: string;
        provider: string;
        providerRef: string;
        providerStatus: string;
        paidAt: string | null;
        createdAt: string;
      }[];
    }[];
  }[];
}

export interface InvoicePaymentsResponse {
  invoice: PortalBillsResponse["invoices"][number];
}

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: Pick<PrismaService, "invoice">) {}

  private toInvoiceDto(inv: InvoiceQueryResult): PortalBillsResponse["invoices"][number] {
    const totalCents = moneyToCents(inv.totalAmount.toString());
    const paidCents = sumAmounts(inv.allocations);
    const balanceCents = clampMin0(totalCents - paidCents);

    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      currency: inv.currency,
      totalAmount: centsToMoney(totalCents),
      paidAmount: centsToMoney(paidCents),
      balanceDue: centsToMoney(balanceCents),
      status: inv.status,
      createdAt: inv.createdAt.toISOString(),
      updatedAt: inv.updatedAt.toISOString(),
      intents: inv.intents.map((pi) => ({
        id: pi.id,
        amount: pi.amount.toString(),
        channel: pi.channel,
        status: pi.status,
        idempotencyKey: pi.idempotencyKey,
        createdFrom: pi.createdFrom,
        createdByUserId: pi.createdByUserId,
        createdAt: pi.createdAt.toISOString(),
        updatedAt: pi.updatedAt.toISOString(),
        transactions: pi.transactions.map((pt) => ({
          id: pt.id,
          provider: pt.provider,
          providerRef: pt.providerRef,
          providerStatus: pt.providerStatus,
          paidAt: pt.paidAt?.toISOString() ?? null,
          createdAt: pt.createdAt.toISOString()
        }))
      }))
    };
  }

  async getPortalBills(args: { tenantId: string; branchId: string }): Promise<PortalBillsResponse> {
    const rows = (await this.prisma.invoice.findMany({
      where: { tenantId: args.tenantId, branchId: args.branchId },
      orderBy: { createdAt: "desc" },
      include: {
        allocations: { select: { amount: true } },
        intents: {
          orderBy: { createdAt: "desc" },
          include: {
            transactions: {
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                provider: true,
                providerRef: true,
                providerStatus: true,
                paidAt: true,
                createdAt: true
              }
            }
          }
        }
      }
    })) as unknown as InvoiceQueryResult[];

    return { invoices: rows.map((r) => this.toInvoiceDto(r)) };
  }

  async getInvoicePayments(args: {
    tenantId: string;
    branchId: string;
    invoiceId: string;
  }): Promise<InvoicePaymentsResponse> {
    const row = (await this.prisma.invoice.findFirst({
      where: { tenantId: args.tenantId, branchId: args.branchId, id: args.invoiceId },
      include: {
        allocations: { select: { amount: true } },
        intents: {
          orderBy: { createdAt: "desc" },
          include: {
            transactions: {
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                provider: true,
                providerRef: true,
                providerStatus: true,
                paidAt: true,
                createdAt: true
              }
            }
          }
        }
      }
    })) as unknown as InvoiceQueryResult | null;

    if (!row) throw new NotFoundException("Invoice not found");
    return { invoice: this.toInvoiceDto(row) };
  }
}
