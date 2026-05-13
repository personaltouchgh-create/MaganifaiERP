export interface EnvelopeEncryptor {
  encrypt: (plaintext: Uint8Array, tenantId: string) => Promise<Uint8Array>;
  decrypt: (ciphertext: Uint8Array, tenantId: string) => Promise<Uint8Array>;
}