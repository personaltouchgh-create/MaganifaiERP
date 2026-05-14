import { BadRequestException, Injectable } from "@nestjs/common";
import { createEnvelopeEncryptorFromEnv } from "@repo/security";
import type { PrismaService } from "../db/prisma.service";

function toBytes(s: string) {
  return new TextEncoder().encode(s);
}

function readActiveKeyVersion() {
  const raw = process.env.ENVELOPE_ACTIVE_KEY_VERSION;
  const v = raw ? Number(raw) : NaN;
  if (!Number.isFinite(v) || v <= 0) throw new Error("Invalid ENVELOPE_ACTIVE_KEY_VERSION");
  return v;
}

export interface PublicPaymentSettings {
  tenantId: string;
  paystackEnabled: boolean;
  channels: { momo: boolean; card: boolean };
  minPartialAmountGhs: string;
  paystackPublicKey: string | null;
  webhookLastSeenAt: string | null;
  webhookLastStatus: string | null;
}

@Injectable()
export class PaymentSettingsService {
  constructor(
    private readonly prisma: Pick<PrismaService, "tenantPaymentSettings">
  ) {}

  async upsert(args: {
    tenantId: string;
    paystackEnabled: boolean;
    channelsMomo: boolean;
    channelsCard: boolean;
    minPartialAmountGhs: string;
    paystackPublicKey?: string | null;
    paystackSecretKey?: string | null;
    paystackWebhookSecret?: string | null;
  }) {
    if (args.paystackEnabled && !(args.channelsMomo || args.channelsCard)) {
      throw new BadRequestException("At least one channel must be enabled");
    }

    const enc = createEnvelopeEncryptorFromEnv();
    const keyVersion = readActiveKeyVersion();

    const secretEnc =
      args.paystackSecretKey === null || args.paystackSecretKey === undefined
        ? undefined
        : Buffer.from(await enc.encrypt(toBytes(args.paystackSecretKey), args.tenantId));

    const webhookEnc =
      args.paystackWebhookSecret === null || args.paystackWebhookSecret === undefined
        ? undefined
        : Buffer.from(await enc.encrypt(toBytes(args.paystackWebhookSecret), args.tenantId));

    return this.prisma.tenantPaymentSettings.upsert({
      where: { tenantId: args.tenantId },
      create: {
        tenantId: args.tenantId,
        keyVersion,
        paystackEnabled: args.paystackEnabled,
        channelsMomo: args.channelsMomo,
        channelsCard: args.channelsCard,
        minPartialAmountGhs: args.minPartialAmountGhs,
        paystackPublicKey: args.paystackPublicKey ?? null,
        paystackSecretKeyEncrypted: secretEnc ?? null,
        paystackWebhookSecretEncrypted: webhookEnc ?? null
      },
      update: {
        keyVersion,
        paystackEnabled: args.paystackEnabled,
        channelsMomo: args.channelsMomo,
        channelsCard: args.channelsCard,
        minPartialAmountGhs: args.minPartialAmountGhs,
        paystackPublicKey: args.paystackPublicKey ?? null,
        ...(secretEnc ? { paystackSecretKeyEncrypted: secretEnc } : {}),
        ...(webhookEnc ? { paystackWebhookSecretEncrypted: webhookEnc } : {})
      }
    });
  }

  async getPublic(tenantId: string): Promise<PublicPaymentSettings | null> {
    const s = await this.prisma.tenantPaymentSettings.findUnique({ where: { tenantId } });
    if (!s) return null;
    return {
      tenantId: s.tenantId,
      paystackEnabled: s.paystackEnabled,
      channels: { momo: s.channelsMomo, card: s.channelsCard },
      minPartialAmountGhs: s.minPartialAmountGhs.toString(),
      paystackPublicKey: s.paystackPublicKey,
      webhookLastSeenAt: s.webhookLastSeenAt?.toISOString() ?? null,
      webhookLastStatus: s.webhookLastStatus ?? null
    };
  }
}

