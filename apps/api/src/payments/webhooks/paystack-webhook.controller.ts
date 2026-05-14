import { BadRequestException, Controller, ForbiddenException, Headers, Param, Post, Req } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { createEnvelopeEncryptorFromEnv } from "@repo/security";
import type { PrismaService } from "../../db/prisma.service";
import { PaymentsService } from "../payments.service";

type RawBodyRequest = Request & { rawBody?: Buffer };
type TenantPaymentSettingsStore = Pick<PrismaService["tenantPaymentSettings"], "findUnique" | "update">;
type PrismaDeps = { tenantPaymentSettings: TenantPaymentSettingsStore };

function safeEqualHex(a: string, b: string) {
  try {
    const aa = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (aa.length !== bb.length) return false;
    return timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

@Controller("payments/webhooks/paystack")
export class PaystackWebhookController {
  constructor(
    private readonly prisma: PrismaDeps,
    private readonly payments: PaymentsService
  ) {}

  @Post(":tenantId")
  async handle(
    @Param("tenantId") tenantId: string,
    @Req() req: RawBodyRequest,
    @Headers("x-paystack-signature") signature?: string
  ) {
    const raw = req.rawBody;
    if (!raw) throw new BadRequestException("Missing raw body");
    if (!signature) throw new ForbiddenException("Missing signature");

    const settings = (await this.prisma.tenantPaymentSettings.findUnique({
      where: { tenantId },
      select: { paystackWebhookSecretEncrypted: true }
    })) as unknown as { paystackWebhookSecretEncrypted: Buffer | null } | null;

    if (!settings?.paystackWebhookSecretEncrypted) throw new ForbiddenException("Webhook secret missing");

    const enc = createEnvelopeEncryptorFromEnv();
    const secret = new TextDecoder().decode(
      await enc.decrypt(new Uint8Array(settings.paystackWebhookSecretEncrypted), tenantId)
    );

    const digest = createHmac("sha512", secret).update(raw).digest("hex");
    if (!safeEqualHex(digest, signature)) throw new ForbiddenException("Invalid signature");

    let payload: unknown = req.body;
    if (!payload || typeof payload !== "object") {
      payload = JSON.parse(raw.toString("utf8")) as unknown;
    }

    const obj = payload as Record<string, unknown>;
    const event = obj.event;
    const data = obj.data;

    try {
      await this.payments.handlePaystackWebhook({
        tenantId,
        event: typeof event === "string" ? event : "",
        data,
        rawPayloadJson: payload
      });

      await this.prisma.tenantPaymentSettings.update({
        where: { tenantId },
        data: { webhookLastSeenAt: new Date(), webhookLastStatus: "OK" }
      });
    } catch {
      await this.prisma.tenantPaymentSettings.update({
        where: { tenantId },
        data: { webhookLastSeenAt: new Date(), webhookLastStatus: "FAIL" }
      });
    }

    return { ok: true };
  }
}
