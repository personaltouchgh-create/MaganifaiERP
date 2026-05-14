import { afterEach, describe, expect, it } from "vitest";
import { createEnvelopeEncryptorFromEnv } from "./crypto.js";

function b64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

afterEach(() => {
  delete process.env.ENVELOPE_ACTIVE_KEY_VERSION;
  delete process.env.ENVELOPE_MASTER_KEYS_JSON;
});

describe("envelope encryption", () => {
  it("encrypts and decrypts using tenant-scoped derived keys", async () => {
    process.env.ENVELOPE_ACTIVE_KEY_VERSION = "1";
    process.env.ENVELOPE_MASTER_KEYS_JSON = JSON.stringify({
      1: b64(crypto.getRandomValues(new Uint8Array(32)))
    });

    const enc = createEnvelopeEncryptorFromEnv();
    const tenantId = "t_demo";
    const plain = new TextEncoder().encode("secret-value");

    const cipher = await enc.encrypt(plain, tenantId);
    expect(cipher).not.toEqual(plain);

    const back = await enc.decrypt(cipher, tenantId);
    expect(new TextDecoder().decode(back)).toBe("secret-value");
  });

  it("throws on unknown key version", async () => {
    process.env.ENVELOPE_ACTIVE_KEY_VERSION = "1";
    process.env.ENVELOPE_MASTER_KEYS_JSON = JSON.stringify({
      1: b64(crypto.getRandomValues(new Uint8Array(32)))
    });

    const enc = createEnvelopeEncryptorFromEnv();
    const tenantId = "t_demo";
    const plain = new TextEncoder().encode("x");
    const cipher = await enc.encrypt(plain, tenantId);

    const mutated = new Uint8Array(cipher);
    const dv = new DataView(mutated.buffer, mutated.byteOffset + 4, 4);
    dv.setUint32(0, 2, false);

    await expect(enc.decrypt(mutated, tenantId)).rejects.toThrow(/key version/i);
  });
});

