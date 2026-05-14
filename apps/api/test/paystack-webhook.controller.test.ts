import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEnvelopeEncryptorFromEnv } from "@repo/security";
import { PaystackWebhookController } from "../src/payments/webhooks/paystack-webhook.controller";
import type { PaymentsService } from "../src/payments/payments.service";

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

describe("paystack webhook controller", () => {
  afterEach(() => {
    delete process.env.ENVELOPE_ACTIVE_KEY_VERSION;
    delete process.env.ENVELOPE_MASTER_KEYS_JSON;
  });

  it("verifies signature using decrypted webhook secret and forwards payload", async () => {
    setEnvelopeEnv();

    const webhookSecretEncrypted = await encryptForTenant({
      tenantId: "t1",
      plaintext: "whsec_test"
    });

    const tenantPaymentSettings = {
      findUnique: vi.fn().mockResolvedValue({ paystackWebhookSecretEncrypted: webhookSecretEncrypted }),
      update: vi.fn()
    };

    const payments = {
      handlePaystackWebhook: vi.fn().mockResolvedValue(undefined)
    } satisfies Pick<PaymentsService, "handlePaystackWebhook">;

    const controller = new PaystackWebhookController(
      { tenantPaymentSettings },
      payments as unknown as PaymentsService
    );

    const payload = {
      event: "charge.success",
      data: { reference: "ref-1", status: "success", paid_at: "2026-01-01T00:00:00.000Z" }
    } as const;

    const rawBody = Buffer.from(JSON.stringify(payload), "utf8");

    const sig = createHmac("sha512", "whsec_test").update(rawBody).digest("hex");

    const res = await controller.handle(
      "t1",
      { rawBody, body: payload } as unknown as never,
      sig
    );

    expect(res).toEqual({ ok: true });
    expect(payments.handlePaystackWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        event: "charge.success"
      })
    );
    const updateArg = tenantPaymentSettings.update.mock.calls[0]?.[0] as unknown as {
      data: { webhookLastStatus: string };
    };
    expect(updateArg.data.webhookLastStatus).toBe("OK");
  });

  it("rejects invalid signature", async () => {
    setEnvelopeEnv();

    const webhookSecretEncrypted = await encryptForTenant({
      tenantId: "t1",
      plaintext: "whsec_test"
    });

    const tenantPaymentSettings = {
      findUnique: vi.fn().mockResolvedValue({ paystackWebhookSecretEncrypted: webhookSecretEncrypted }),
      update: vi.fn()
    };

    const payments = {
      handlePaystackWebhook: vi.fn().mockResolvedValue(undefined)
    } satisfies Pick<PaymentsService, "handlePaystackWebhook">;

    const controller = new PaystackWebhookController(
      { tenantPaymentSettings },
      payments as unknown as PaymentsService
    );

    const rawBody = Buffer.from('{"event":"charge.success","data":{"reference":"ref-1"}}', "utf8");

    await expect(
      controller.handle("t1", { rawBody, body: {} } as unknown as never, "bad")
    ).rejects.toMatchObject({ message: "Invalid signature" });
  });
});
