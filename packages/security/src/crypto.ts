import { hkdfSync, randomBytes } from "node:crypto";

export interface EnvelopeEncryptor {
  encrypt: (plaintext: Uint8Array, tenantId: string) => Promise<Uint8Array>;
  decrypt: (ciphertext: Uint8Array, tenantId: string) => Promise<Uint8Array>;
}

type MasterKeyMap = Record<string, string>;

const MAGIC = new TextEncoder().encode("MFG1");

function readEnvRequired(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function u32be(n: number) {
  const b = new Uint8Array(4);
  const v = new DataView(b.buffer);
  v.setUint32(0, n, false);
  return b;
}

function concatBytes(...parts: Uint8Array[]) {
  const len = parts.reduce((a, p) => a + p.byteLength, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

function deriveTenantKey(args: {
  masterKey: Uint8Array;
  tenantId: string;
  keyVersion: number;
}) {
  const salt = new TextEncoder().encode(args.tenantId);
  const info = new TextEncoder().encode(`field-aes-256-gcm:v${args.keyVersion}`);
  return hkdfSync("sha256", args.masterKey, salt, info, 32);
}

function parseKeyMap(raw: string): Record<number, Uint8Array> {
  const m = JSON.parse(raw) as MasterKeyMap;
  const out: Record<number, Uint8Array> = {};
  for (const [k, v] of Object.entries(m)) {
    const ver = Number(k);
    if (!Number.isFinite(ver)) continue;
    out[ver] = new Uint8Array(Buffer.from(v, "base64"));
  }
  return out;
}

export function createEnvelopeEncryptorFromEnv(): EnvelopeEncryptor {
  const activeVersion = Number(readEnvRequired("ENVELOPE_ACTIVE_KEY_VERSION"));
  if (!Number.isFinite(activeVersion) || activeVersion <= 0) {
    throw new Error("Invalid ENVELOPE_ACTIVE_KEY_VERSION");
  }

  const keyMap = parseKeyMap(readEnvRequired("ENVELOPE_MASTER_KEYS_JSON"));
  const activeMaster = keyMap[activeVersion];
  if (!activeMaster || activeMaster.byteLength !== 32) {
    throw new Error("Active master key missing or not 32 bytes");
  }

  return {
    async encrypt(plaintext, tenantId) {
      const iv = randomBytes(12);
      const key = deriveTenantKey({
        masterKey: activeMaster,
        tenantId,
        keyVersion: activeVersion
      });
      const subtleKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, [
        "encrypt"
      ]);
      const ct = new Uint8Array(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          subtleKey,
          plaintext as unknown as BufferSource
        )
      );
      return concatBytes(MAGIC, u32be(activeVersion), iv, ct);
    },
    async decrypt(ciphertext, tenantId) {
      const bytes = new Uint8Array(ciphertext);
      const magic = bytes.slice(0, 4);
      if (Buffer.compare(Buffer.from(magic), Buffer.from(MAGIC)) !== 0) {
        throw new Error("Invalid ciphertext header");
      }
      if (bytes.byteLength < 21) throw new Error("Invalid ciphertext length");
      const dv = new DataView(bytes.buffer, bytes.byteOffset + 4, 4);
      const ver = dv.getUint32(0, false);
      const mk = keyMap[ver];
      if (!mk) throw new Error(`Unknown key version: ${ver}`);
      const iv = bytes.slice(8, 20);
      const ct = bytes.slice(20);
      const key = deriveTenantKey({ masterKey: mk, tenantId, keyVersion: ver });
      const subtleKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, [
        "decrypt"
      ]);
      const pt = new Uint8Array(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv },
          subtleKey,
          ct as unknown as BufferSource
        )
      );
      return pt;
    }
  };
}
