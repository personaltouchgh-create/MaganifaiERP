import { afterEach, describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { PaymentSettingsService } from "../src/tenants/payment-settings.service";
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

describe("payment settings service", () => {
  afterEach(() => {
    delete process.env.ENVELOPE_ACTIVE_KEY_VERSION;
    delete process.env.ENVELOPE_MASTER_KEYS_JSON;
  });

  it("encrypts secrets on upsert and never returns them from getPublic", async () => {
    setEnvelopeEnv();

    const upsert = vi.fn().mockResolvedValue({
      tenantId: "t1",
      keyVersion: 1,
      paystackEnabled: true,
      paystackPublicKey: "pk_test",
      paystackSecretKeyEncrypted: Buffer.from("cipher"),
      paystackWebhookSecretEncrypted: Buffer.from("cipher2"),
      channelsMomo: true,
      channelsCard: false,
      minPartialAmountGhs: { toString: () => "1.00" },
      webhookLastSeenAt: null,
      webhookLastStatus: null
    });

    const findUnique = vi.fn().mockResolvedValue({
      tenantId: "t1",
      paystackEnabled: true,
      paystackPublicKey: "pk_test",
      paystackSecretKeyEncrypted: Buffer.from("cipher"),
      paystackWebhookSecretEncrypted: Buffer.from("cipher2"),
      channelsMomo: true,
      channelsCard: false,
      minPartialAmountGhs: { toString: () => "1.00" },
      webhookLastSeenAt: null,
      webhookLastStatus: null
    });

    const prisma = {
      tenantPaymentSettings: { upsert, findUnique }
    } as unknown as Pick<PrismaService, "tenantPaymentSettings">;

    const svc = new PaymentSettingsService(prisma);

    await svc.upsert({
      tenantId: "t1",
      paystackEnabled: true,
      channelsMomo: true,
      channelsCard: false,
      minPartialAmountGhs: "1.00",
      paystackPublicKey: "pk_test",
      paystackSecretKey: "sk_test_secret",
      paystackWebhookSecret: "whsec_test_secret"
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0]?.[0] as {
      create: {
        paystackSecretKeyEncrypted: Buffer | null;
        paystackWebhookSecretEncrypted: Buffer | null;
      };
      update: {
        paystackSecretKeyEncrypted?: Buffer;
        paystackWebhookSecretEncrypted?: Buffer;
      };
    };
    const secretCipher =
      arg.create.paystackSecretKeyEncrypted ?? arg.update.paystackSecretKeyEncrypted;
    const webhookCipher =
      arg.create.paystackWebhookSecretEncrypted ?? arg.update.paystackWebhookSecretEncrypted;

    expect(secretCipher).toBeInstanceOf(Buffer);
    expect(webhookCipher).toBeInstanceOf(Buffer);
    expect(secretCipher?.subarray(0, 4).toString("utf8")).toBe("MFG1");
    expect(webhookCipher?.subarray(0, 4).toString("utf8")).toBe("MFG1");
    expect(secretCipher?.toString("utf8")).not.toContain("sk_test_secret");
    expect(webhookCipher?.toString("utf8")).not.toContain("whsec_test_secret");

    const pub = await svc.getPublic("t1");
    expect(pub).toMatchObject({
      tenantId: "t1",
      paystackEnabled: true,
      channels: { momo: true, card: false },
      minPartialAmountGhs: "1.00",
      paystackPublicKey: "pk_test",
      webhookLastSeenAt: null,
      webhookLastStatus: null
    });
    expect(pub).not.toHaveProperty("paystackSecretKey");
    expect(pub).not.toHaveProperty("paystackWebhookSecret");
  });

  it("requires at least one channel when paystack is enabled", async () => {
    setEnvelopeEnv();

    const prisma = {
      tenantPaymentSettings: { upsert: vi.fn(), findUnique: vi.fn() }
    } as unknown as Pick<PrismaService, "tenantPaymentSettings">;

    const svc = new PaymentSettingsService(prisma);
    await expect(
      svc.upsert({
        tenantId: "t1",
        paystackEnabled: true,
        channelsMomo: false,
        channelsCard: false,
        minPartialAmountGhs: "1.00",
        paystackPublicKey: null
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
