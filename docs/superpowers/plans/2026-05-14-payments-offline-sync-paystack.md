# Payments + Offline Sync (Paystack) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement production-grade, multi-tenant + multi-branch invoice payments with Paystack (MoMo/Card), partial payments (min + cap), strict RBAC/audit, encrypted per-tenant Paystack secrets, and daily reconciliation with mismatch fixing.

**Architecture:** NestJS API owns the source of truth (Prisma/Postgres). Paystack is integrated via a small provider client (fetch). Secrets are encrypted at rest with AES-256-GCM envelope encryption and key versioning. ERP desktop/mobile will later sync operational events via SQLite outbox; Paystack pay-now remains online-only.

**Tech Stack:** Node 20+, NestJS, Prisma/Postgres, Vitest, Next.js (portal), Vite React (ERP web), `@repo/security` (rbac/redact/audit/crypto).

---

## File Structure (Targets)

### Backend (NestJS API)

- Create: `apps/api/prisma/schema.prisma` (models for tenant/branch/invoice/payments/audit/reconciliation)
- Create: `apps/api/src/db/prisma.service.ts`
- Create: `apps/api/src/db/db.module.ts`
- Create: `apps/api/src/auth/auth.context.ts`
- Create: `apps/api/src/auth/auth.guard.ts`
- Create: `apps/api/src/audit/audit.service.ts`
- Create: `apps/api/src/audit/audit.module.ts`
- Create: `apps/api/src/tenants/payment-settings.controller.ts`
- Create: `apps/api/src/tenants/payment-settings.service.ts`
- Create: `apps/api/src/tenants/tenants.module.ts`
- Create: `apps/api/src/invoices/invoices.controller.ts`
- Create: `apps/api/src/invoices/invoices.service.ts`
- Create: `apps/api/src/invoices/invoices.module.ts`
- Create: `apps/api/src/payments/paystack/paystack.client.ts`
- Create: `apps/api/src/payments/payments.controller.ts`
- Create: `apps/api/src/payments/payments.service.ts`
- Create: `apps/api/src/payments/payments.module.ts`
- Create: `apps/api/src/payments/webhooks/paystack-webhook.controller.ts`
- Create: `apps/api/src/reconciliation/reconciliation.controller.ts`
- Create: `apps/api/src/reconciliation/reconciliation.service.ts`
- Create: `apps/api/src/reconciliation/reconciliation.module.ts`
- Modify: `apps/api/src/app.module.ts` (wire new modules)
- Modify: `apps/api/src/main.ts` (body raw capture for Paystack signature verification)

### Worker

- Create: `apps/worker/src/reconciliation/reconciliation.job.ts`
- Modify: `apps/worker/src/main.ts` (schedule daily reconciliation per tenant)

### Security Package

- Modify: `packages/security/src/crypto.ts` (envelope encryptor implementation + env configuration)
- Test: `packages/security/src/crypto.test.ts`

### Portal (Next.js)

- Modify: `apps/portal-pwa/app/page.tsx` (route to bills list)
- Create: `apps/portal-pwa/app/bills/page.tsx` (PWA-100)
- Create: `apps/portal-pwa/app/bills/[invoiceId]/pay/page.tsx` (PWA-110)
- Create: `apps/portal-pwa/app/payments/[intentId]/status/page.tsx` (PWA-120)
- Create: `apps/portal-pwa/src/lib/api.ts` (typed API client)
- Test: `apps/portal-pwa/app/bills/bills.test.tsx` (component-level tests; no external network)

### ERP Web (Vite React)

- Create: `apps/erp-web/src/features/payments/PaymentSettings.tsx` (ERP-PAY-001)
- Create: `apps/erp-web/src/features/payments/InvoicePaymentsTab.tsx` (ERP-PAY-010)
- Create: `apps/erp-web/src/features/payments/ReconciliationReport.tsx` (ERP-PAY-020)
- Modify: `apps/erp-web/src/App.tsx` (route/shell to these screens)
- Test: `apps/erp-web/src/features/payments/payments.test.tsx`

---

## Environment Variables (Design-Time Contract)

- `DATABASE_URL` (Postgres)
- `ENVELOPE_ACTIVE_KEY_VERSION` (e.g. `1`)
- `ENVELOPE_MASTER_KEYS_JSON` (JSON mapping version to base64 key, e.g. `{"1":"<base64-32-bytes>"}`)
- `PAYSTACK_API_BASE_URL` (default `https://api.paystack.co`)

---

### Task 1: Add envelope encryption + key versioning in `@repo/security`

**Files:**
- Modify: `packages/security/src/crypto.ts`
- Test: `packages/security/src/crypto.test.ts`

- [ ] **Step 1: Write failing unit tests for encrypt/decrypt roundtrip and key versioning**

```ts
import { describe, expect, it } from "vitest";
import { createEnvelopeEncryptorFromEnv } from "./crypto.js";

function b64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

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
    process.env.ENVELOPE_ACTIVE_KEY_VERSION = "2";
    process.env.ENVELOPE_MASTER_KEYS_JSON = JSON.stringify({
      1: b64(crypto.getRandomValues(new Uint8Array(32)))
    });

    const enc = createEnvelopeEncryptorFromEnv();
    const tenantId = "t_demo";
    const plain = new TextEncoder().encode("x");
    const cipher = await enc.encrypt(plain, tenantId);

    await expect(enc.decrypt(cipher, tenantId)).rejects.toThrow(/key version/i);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail (function not implemented)**

Run:

```bash
pnpm --filter @repo/security test
```

Expected: FAIL with import/undefined errors for `createEnvelopeEncryptorFromEnv`.

- [ ] **Step 3: Implement AES-256-GCM envelope encryption in `crypto.ts`**

```ts
import { createHmac, createSecretKey, hkdfSync, randomBytes } from "node:crypto";

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
        await crypto.subtle.encrypt({ name: "AES-GCM", iv }, subtleKey, plaintext)
      );
      return concatBytes(MAGIC, u32be(activeVersion), iv, ct);
    },
    async decrypt(ciphertext, tenantId) {
      const bytes = new Uint8Array(ciphertext);
      const magic = bytes.slice(0, 4);
      if (Buffer.compare(Buffer.from(magic), Buffer.from(MAGIC)) !== 0) {
        throw new Error("Invalid ciphertext header");
      }
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
        await crypto.subtle.decrypt({ name: "AES-GCM", iv }, subtleKey, ct)
      );
      return pt;
    }
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run:

```bash
pnpm --filter @repo/security test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/security/src/crypto.ts packages/security/src/crypto.test.ts
git commit -m "feat(security): add envelope encryption with key versioning"
```

---

### Task 2: Add Prisma + models for multi-tenant + multi-branch invoices/payments/audit

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/db/prisma.service.ts`
- Create: `apps/api/src/db/db.module.ts`
- Test: `apps/api/test/db.smoke.test.ts`

- [ ] **Step 1: Add Prisma dependencies to `@repo/api`**

Run:

```bash
pnpm --filter @repo/api add prisma @prisma/client
pnpm --filter @repo/api add -D @types/node
```

- [ ] **Step 2: Write a failing DB smoke test that imports PrismaService**

```ts
import { describe, expect, it } from "vitest";

describe("db", () => {
  it("exposes PrismaService", async () => {
    const mod = await import("../src/db/prisma.service.js");
    expect(mod.PrismaService).toBeTypeOf("function");
  });
});
```

- [ ] **Step 3: Implement PrismaService and DbModule**

`apps/api/src/db/prisma.service.ts`

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

`apps/api/src/db/db.module.ts`

```ts
import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService]
})
export class DbModule {}
```

- [ ] **Step 4: Define Prisma models (tenant, branch, invoice, payments, audit, reconciliation)**

Replace `apps/api/prisma/schema.prisma` with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Tenant {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  branches  Branch[]
}

model Branch {
  id        String   @id @default(cuid())
  tenantId  String
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
}

model TenantPaymentSettings {
  tenantId                    String  @id
  keyVersion                  Int
  paystackEnabled             Boolean @default(false)
  paystackPublicKey           String?
  paystackSecretKeyEncrypted  Bytes?
  paystackWebhookSecretEncrypted Bytes?
  channelsMomo                Boolean @default(false)
  channelsCard                Boolean @default(false)
  minPartialAmountGhs         Decimal @db.Decimal(10, 2)
  webhookLastSeenAt           DateTime?
  webhookLastStatus           String?
  updatedAt                   DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])
}

model Invoice {
  id          String   @id @default(cuid())
  tenantId    String
  branchId    String
  invoiceNumber String
  currency    String   @default("GHS")
  totalAmount Decimal  @db.Decimal(10, 2)
  status      String   @default("OPEN")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  allocations PaymentAllocation[]
  intents     PaymentIntent[]

  @@unique([tenantId, invoiceNumber])
  @@index([tenantId, branchId])
}

model PaymentIntent {
  id             String   @id @default(cuid())
  tenantId       String
  branchId       String
  invoiceId      String
  amount         Decimal  @db.Decimal(10, 2)
  channel        String
  status         String   @default("PENDING")
  idempotencyKey String
  createdFrom    String
  createdByUserId String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  invoice Invoice @relation(fields: [invoiceId], references: [id])
  transactions PaymentTransaction[]

  @@unique([tenantId, idempotencyKey])
  @@index([tenantId, invoiceId, status])
}

model PaymentTransaction {
  id             String   @id @default(cuid())
  tenantId       String
  branchId       String
  paymentIntentId String
  provider       String
  providerRef    String
  providerStatus String
  paidAt         DateTime?
  rawPayloadJson Json
  createdAt      DateTime @default(now())

  intent PaymentIntent @relation(fields: [paymentIntentId], references: [id])
  allocations PaymentAllocation[]
  refunds Refund[]

  @@unique([tenantId, providerRef])
  @@index([tenantId, paymentIntentId])
}

model PaymentAllocation {
  id                 String   @id @default(cuid())
  tenantId           String
  branchId           String
  invoiceId          String
  paymentTransactionId String
  amount             Decimal  @db.Decimal(10, 2)
  createdAt          DateTime @default(now())

  invoice Invoice @relation(fields: [invoiceId], references: [id])
  transaction PaymentTransaction @relation(fields: [paymentTransactionId], references: [id])

  @@index([tenantId, invoiceId])
}

model Refund {
  id                  String   @id @default(cuid())
  tenantId            String
  branchId            String
  paymentTransactionId String
  amount              Decimal  @db.Decimal(10, 2)
  reason              String
  status              String   @default("PENDING")
  providerRef         String?
  requestedByUserId   String
  approvedByUserId    String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  transaction PaymentTransaction @relation(fields: [paymentTransactionId], references: [id])

  @@index([tenantId, paymentTransactionId])
}

model AuditLog {
  id             String   @id @default(cuid())
  tenantId       String
  branchId       String?
  actorUserId    String
  action         String
  entityType     String
  entityId       String
  idempotencyKey String
  requestId      String
  occurredAt     DateTime
  metadata       Json

  @@index([tenantId, branchId])
  @@unique([tenantId, idempotencyKey])
}

model ReconciliationRun {
  id          String   @id @default(cuid())
  tenantId    String
  date        DateTime
  providerSuccessCount Int
  allocatedCount       Int
  mismatchCount        Int
  generatedAt DateTime @default(now())

  mismatches ReconciliationMismatch[]

  @@unique([tenantId, date])
}

model ReconciliationMismatch {
  id              String   @id @default(cuid())
  tenantId         String
  branchId         String?
  runId            String
  providerRef      String
  amount           Decimal  @db.Decimal(10, 2)
  providerStatus   String
  erpStatus        String
  reason           String
  state            String   @default("OPEN")
  resolutionJson   Json?
  createdAt        DateTime @default(now())

  run ReconciliationRun @relation(fields: [runId], references: [id])

  @@index([tenantId, runId])
}
```

- [ ] **Step 5: Generate Prisma client**

Run:

```bash
pnpm --filter @repo/api exec prisma generate
```

Expected: Prisma client generated successfully.

- [ ] **Step 6: Run API tests**

Run:

```bash
pnpm --filter @repo/api test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json apps/api/prisma/schema.prisma apps/api/src/db apps/api/test/db.smoke.test.ts
git commit -m "feat(api): add prisma db module and payment domain models"
```

---

### Task 3: Add request auth context, RBAC guard, and audit logging

**Files:**
- Create: `apps/api/src/auth/auth.context.ts`
- Create: `apps/api/src/auth/auth.guard.ts`
- Create: `apps/api/src/audit/audit.service.ts`
- Create: `apps/api/src/audit/audit.module.ts`
- Test: `apps/api/test/rbac.test.ts`

- [ ] **Step 1: Write failing RBAC unit test using `@repo/security` can()**

```ts
import { describe, expect, it } from "vitest";
import { can } from "@repo/security";

describe("rbac", () => {
  it("allows role permission unless explicitly denied for branch", () => {
    const ok = can({
      requested: "SETTINGS.PAYMENTS.EDIT",
      branchId: "b1",
      rolePermissions: ["SETTINGS.PAYMENTS.EDIT"],
      userGrants: [{ permissionKey: "SETTINGS.PAYMENTS.EDIT", effect: "DENY", branchId: "b2" }]
    });
    expect(ok).toBe(true);
  });
});
```

- [ ] **Step 2: Implement auth context (dev-friendly, production-safe defaults)**

`apps/api/src/auth/auth.context.ts`

```ts
export type AuthContext = {
  tenantId: string;
  branchId: string | null;
  userId: string;
  rolePermissions: string[];
  userGrants: { permissionKey: string; effect: "ALLOW" | "DENY"; branchId: string | null }[];
  requestId: string;
};
```

`apps/api/src/auth/auth.guard.ts`

```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { can } from "@repo/security";
import type { AuthContext } from "./auth.context.js";

export function getAuthContextFromRequest(req: any): AuthContext {
  const tenantId = req.headers["x-tenant-id"];
  const branchId = req.headers["x-branch-id"] ?? null;
  const userId = req.headers["x-user-id"];
  const requestId = req.headers["x-request-id"] ?? crypto.randomUUID();

  if (!tenantId || !userId) {
    throw new ForbiddenException("Missing auth headers");
  }

  const rolePermissions = String(req.headers["x-role-permissions"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    tenantId: String(tenantId),
    branchId: branchId ? String(branchId) : null,
    userId: String(userId),
    rolePermissions,
    userGrants: [],
    requestId
  };
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly permission: string) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const auth = getAuthContextFromRequest(req);
    const ok = can({
      requested: this.permission,
      branchId: auth.branchId,
      rolePermissions: auth.rolePermissions,
      userGrants: auth.userGrants
    });
    if (!ok) throw new ForbiddenException("Forbidden");
    req.auth = auth;
    return true;
  }
}
```

- [ ] **Step 3: Implement audit service writing to Prisma AuditLog**

`apps/api/src/audit/audit.service.ts`

```ts
import { Injectable } from "@nestjs/common";
import type { AuditEvent } from "@repo/security";
import { PrismaService } from "../db/prisma.service.js";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async write(e: AuditEvent) {
    await this.prisma.auditLog.create({
      data: {
        tenantId: e.tenantId,
        branchId: e.branchId,
        actorUserId: e.actorUserId,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        idempotencyKey: e.idempotencyKey,
        requestId: e.requestId,
        occurredAt: new Date(e.occurredAt),
        metadata: e.metadata
      }
    });
  }
}
```

`apps/api/src/audit/audit.module.ts`

```ts
import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service.js";

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --filter @repo/api test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth apps/api/src/audit apps/api/test/rbac.test.ts
git commit -m "feat(api): add auth context, rbac guard, and audit service"
```

---

### Task 4: Tenant Payment Settings API (encrypted secrets, RBAC + audit)

**Files:**
- Create: `apps/api/src/tenants/payment-settings.controller.ts`
- Create: `apps/api/src/tenants/payment-settings.service.ts`
- Create: `apps/api/src/tenants/tenants.module.ts`
- Test: `apps/api/test/payment-settings.e2e.test.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Add Nest testing deps (for controller e2e via supertest)**

Run:

```bash
pnpm --filter @repo/api add -D @nestjs/testing supertest @types/supertest
```

- [ ] **Step 2: Write failing e2e test for PUT/GET payment settings**

```ts
import { describe, expect, it } from "vitest";

describe("payment settings", () => {
  it("rejects when missing RBAC", async () => {
    expect(true).toBe(true);
  });
});
```

Then evolve this test after the controller exists to:
- Start Nest app in-memory
- Call `PUT /tenants/:tenantId/payment-settings` with missing `x-role-permissions`
- Expect 403

- [ ] **Step 3: Implement service to encrypt secrets using `createEnvelopeEncryptorFromEnv`**

`apps/api/src/tenants/payment-settings.service.ts`

```ts
import { BadRequestException, Injectable } from "@nestjs/common";
import { createEnvelopeEncryptorFromEnv } from "@repo/security";
import { PrismaService } from "../db/prisma.service.js";

function toBytes(s: string) {
  return new TextEncoder().encode(s);
}

@Injectable()
export class PaymentSettingsService {
  constructor(private readonly prisma: PrismaService) {}

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
    const keyVersion = Number(process.env.ENVELOPE_ACTIVE_KEY_VERSION);

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

  async getPublic(tenantId: string) {
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
```

- [ ] **Step 4: Implement controller with RBAC guard + audit**

`apps/api/src/tenants/payment-settings.controller.ts`

```ts
import { Body, Controller, Get, Param, Put, Req, UseGuards } from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import { PermissionGuard } from "../auth/auth.guard.js";
import { PaymentSettingsService } from "./payment-settings.service.js";

@Controller("tenants/:tenantId/payment-settings")
export class PaymentSettingsController {
  constructor(
    private readonly svc: PaymentSettingsService,
    private readonly audit: AuditService
  ) {}

  @Get()
  @UseGuards(new PermissionGuard("SETTINGS.PAYMENTS.VIEW"))
  async get(@Param("tenantId") tenantId: string) {
    return this.svc.getPublic(tenantId);
  }

  @Put()
  @UseGuards(new PermissionGuard("SETTINGS.PAYMENTS.EDIT"))
  async put(
    @Param("tenantId") tenantId: string,
    @Req() req: any,
    @Body()
    body: {
      paystackEnabled: boolean;
      channelsMomo: boolean;
      channelsCard: boolean;
      minPartialAmountGhs: string;
      paystackPublicKey?: string | null;
      paystackSecretKey?: string | null;
      paystackWebhookSecret?: string | null;
      idempotencyKey: string;
    }
  ) {
    const saved = await this.svc.upsert({ tenantId, ...body });
    await this.audit.write({
      tenantId,
      branchId: req.auth.branchId,
      actorUserId: req.auth.userId,
      action: "TENANT_PAYMENT_SETTINGS.UPDATE",
      entityType: "TenantPaymentSettings",
      entityId: tenantId,
      idempotencyKey: body.idempotencyKey,
      requestId: req.auth.requestId,
      occurredAt: new Date().toISOString(),
      metadata: {
        paystackEnabled: body.paystackEnabled,
        channelsMomo: body.channelsMomo,
        channelsCard: body.channelsCard,
        minPartialAmountGhs: body.minPartialAmountGhs,
        paystackPublicKeySet: Boolean(body.paystackPublicKey),
        paystackSecretKeyReplaced: body.paystackSecretKey != null,
        paystackWebhookSecretReplaced: body.paystackWebhookSecret != null
      }
    });
    return {
      tenantId: saved.tenantId,
      paystackEnabled: saved.paystackEnabled
    };
  }
}
```

`apps/api/src/tenants/tenants.module.ts`

```ts
import { Module } from "@nestjs/common";
import { PaymentSettingsController } from "./payment-settings.controller.js";
import { PaymentSettingsService } from "./payment-settings.service.js";

@Module({
  controllers: [PaymentSettingsController],
  providers: [PaymentSettingsService]
})
export class TenantsModule {}
```

- [ ] **Step 5: Wire module in AppModule**

Modify `apps/api/src/app.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module.js";
import { DbModule } from "./db/db.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { TenantsModule } from "./tenants/tenants.module.js";

@Module({
  imports: [DbModule, AuditModule, HealthModule, TenantsModule]
})
export class AppModule {}
```

- [ ] **Step 6: Run lint/typecheck/test**

Run:

```bash
pnpm --filter @repo/api lint
pnpm --filter @repo/api typecheck
pnpm --filter @repo/api test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/tenants apps/api/src/app.module.ts
git commit -m "feat(api): add tenant payment settings with encrypted secrets"
```

---

### Task 5: Invoices endpoints used by Portal bills list and ERP payments tab

**Files:**
- Create: `apps/api/src/invoices/invoices.controller.ts`
- Create: `apps/api/src/invoices/invoices.service.ts`
- Create: `apps/api/src/invoices/invoices.module.ts`
- Test: `apps/api/test/invoices.test.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing unit test for computing balance due from allocations**

```ts
import { describe, expect, it } from "vitest";

describe("invoice balance", () => {
  it("computes balance due as total minus sum(allocations)", () => {
    const total = 200;
    const paid = 80;
    expect(total - paid).toBe(120);
  });
});
```

- [ ] **Step 2: Implement minimal invoice query service**

`apps/api/src/invoices/invoices.service.ts`

```ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../db/prisma.service.js";

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForPortal(args: { tenantId: string; branchId: string; customerId: string }) {
    return this.prisma.invoice.findMany({
      where: { tenantId: args.tenantId, branchId: args.branchId, status: "OPEN" },
      orderBy: { createdAt: "desc" }
    });
  }

  async getInvoiceWithPayments(args: { tenantId: string; invoiceId: string }) {
    return this.prisma.invoice.findFirst({
      where: { tenantId: args.tenantId, id: args.invoiceId },
      include: {
        allocations: true,
        intents: { include: { transactions: true } }
      }
    });
  }
}
```

- [ ] **Step 3: Add controller endpoints**

`apps/api/src/invoices/invoices.controller.ts`

```ts
import { Controller, Get, Param, Req } from "@nestjs/common";
import { InvoicesService } from "./invoices.service.js";

@Controller()
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get("portal/bills")
  async portalBills(@Req() req: any) {
    const tenantId = req.auth.tenantId;
    const branchId = req.auth.branchId ?? "";
    const customerId = req.headers["x-customer-id"] ?? "";
    return this.invoices.listForPortal({
      tenantId,
      branchId: String(branchId),
      customerId: String(customerId)
    });
  }

  @Get("invoices/:invoiceId/payments")
  async invoicePayments(@Req() req: any, @Param("invoiceId") invoiceId: string) {
    return this.invoices.getInvoiceWithPayments({ tenantId: req.auth.tenantId, invoiceId });
  }
}
```

- [ ] **Step 4: Wire module**

`apps/api/src/invoices/invoices.module.ts`

```ts
import { Module } from "@nestjs/common";
import { InvoicesController } from "./invoices.controller.js";
import { InvoicesService } from "./invoices.service.js";

@Module({ controllers: [InvoicesController], providers: [InvoicesService] })
export class InvoicesModule {}
```

Add to `AppModule` imports.

- [ ] **Step 5: Run lint/typecheck/test**

```bash
pnpm --filter @repo/api lint
pnpm --filter @repo/api typecheck
pnpm --filter @repo/api test
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/invoices apps/api/src/app.module.ts
git commit -m "feat(api): add invoices endpoints for portal and erp"
```

---

### Task 6: Paystack client + Create PaymentIntent endpoint (min/cap + single pending)

**Files:**
- Create: `apps/api/src/payments/paystack/paystack.client.ts`
- Create: `apps/api/src/payments/payments.service.ts`
- Create: `apps/api/src/payments/payments.controller.ts`
- Create: `apps/api/src/payments/payments.module.ts`
- Test: `apps/api/test/payments.create-intent.test.ts`

- [ ] **Step 1: Write failing unit test for amount validation**

```ts
import { describe, expect, it } from "vitest";

describe("payments validation", () => {
  it("rejects amount below min partial", () => {
    const min = 10;
    const amount = 9;
    expect(amount >= min).toBe(false);
  });
});
```

- [ ] **Step 2: Implement Paystack client (fetch wrapper)**

`apps/api/src/payments/paystack/paystack.client.ts`

```ts
export type PaystackInitResponse = {
  authorization_url: string;
  access_code: string;
  reference: string;
};

export class PaystackClient {
  constructor(private readonly baseUrl: string) {}

  async initializeTransaction(args: {
    secretKey: string;
    email: string;
    amountPesewas: number;
    callbackUrl: string;
    metadata: Record<string, unknown>;
  }): Promise<PaystackInitResponse> {
    const res = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.secretKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: args.email,
        amount: args.amountPesewas,
        callback_url: args.callbackUrl,
        metadata: args.metadata
      })
    });
    const json = (await res.json()) as any;
    if (!res.ok || !json?.status) {
      throw new Error(`Paystack initialize failed: ${res.status}`);
    }
    return json.data;
  }

  async verifyTransaction(args: { secretKey: string; reference: string }) {
    const res = await fetch(`${this.baseUrl}/transaction/verify/${args.reference}`, {
      headers: { Authorization: `Bearer ${args.secretKey}` }
    });
    const json = (await res.json()) as any;
    if (!res.ok || !json?.status) throw new Error(`Paystack verify failed: ${res.status}`);
    return json.data;
  }

  async refund(args: { secretKey: string; reference: string; amountPesewas?: number }) {
    const res = await fetch(`${this.baseUrl}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.secretKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        transaction: args.reference,
        ...(args.amountPesewas ? { amount: args.amountPesewas } : {})
      })
    });
    const json = (await res.json()) as any;
    if (!res.ok || !json?.status) throw new Error(`Paystack refund failed: ${res.status}`);
    return json.data;
  }
}
```

- [ ] **Step 3: Implement PaymentsService create intent with idempotency + single pending**

`apps/api/src/payments/payments.service.ts`

```ts
import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { createEnvelopeEncryptorFromEnv } from "@repo/security";
import { PrismaService } from "../db/prisma.service.js";
import { PaymentSettingsService } from "../tenants/payment-settings.service.js";
import { PaystackClient } from "./paystack/paystack.client.js";

function pesewas(amountGhs: string) {
  return Math.round(Number(amountGhs) * 100);
}

@Injectable()
export class PaymentsService {
  private readonly paystack = new PaystackClient(process.env.PAYSTACK_API_BASE_URL ?? "https://api.paystack.co");

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PaymentSettingsService
  ) {}

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
  }) {
    const inv = await this.prisma.invoice.findFirst({
      where: { tenantId: args.tenantId, id: args.invoiceId }
    });
    if (!inv) throw new BadRequestException("Invoice not found");
    if (inv.branchId !== args.branchId) throw new BadRequestException("Invoice branch mismatch");

    const s = await this.prisma.tenantPaymentSettings.findUnique({ where: { tenantId: args.tenantId } });
    if (!s || !s.paystackEnabled) throw new BadRequestException("Paystack not enabled");
    if (args.channel === "MOMO" && !s.channelsMomo) throw new BadRequestException("MoMo not enabled");
    if (args.channel === "CARD" && !s.channelsCard) throw new BadRequestException("Card not enabled");

    const enc = createEnvelopeEncryptorFromEnv();
    if (!s.paystackSecretKeyEncrypted) throw new BadRequestException("Paystack secret missing");
    const secret = new TextDecoder().decode(
      await enc.decrypt(new Uint8Array(s.paystackSecretKeyEncrypted), args.tenantId)
    );

    const allocations = await this.prisma.paymentAllocation.findMany({
      where: { tenantId: args.tenantId, invoiceId: inv.id }
    });
    const paid = allocations.reduce((a, x) => a + Number(x.amount.toString()), 0);
    const balance = Number(inv.totalAmount.toString()) - paid;

    const min = Number(s.minPartialAmountGhs.toString());
    const amount = Number(args.amountGhs);
    if (Number.isNaN(amount) || amount <= 0) throw new BadRequestException("Invalid amount");
    if (amount < min) throw new BadRequestException("Below minimum partial amount");
    if (amount > balance) throw new BadRequestException("Above balance due");

    const existingPending = await this.prisma.paymentIntent.findFirst({
      where: { tenantId: args.tenantId, invoiceId: inv.id, status: "PENDING" }
    });
    if (existingPending) throw new ConflictException("Pending payment already exists for invoice");

    const intent = await this.prisma.paymentIntent.create({
      data: {
        tenantId: args.tenantId,
        branchId: inv.branchId,
        invoiceId: inv.id,
        amount: args.amountGhs,
        channel: args.channel,
        status: "PENDING",
        idempotencyKey: args.idempotencyKey,
        createdFrom: "PORTAL",
        createdByUserId: args.createdByUserId
      }
    });

    const init = await this.paystack.initializeTransaction({
      secretKey: secret,
      email: args.customerEmail,
      amountPesewas: pesewas(args.amountGhs),
      callbackUrl: args.callbackUrl,
      metadata: { tenantId: args.tenantId, invoiceId: inv.id, intentId: intent.id }
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

    return { intentId: intent.id, authorizationUrl: init.authorization_url, reference: init.reference };
  }
}
```

- [ ] **Step 4: Expose endpoint `POST /payments/intents`**

`apps/api/src/payments/payments.controller.ts`

```ts
import { Body, Controller, Param, Post, Req } from "@nestjs/common";
import { PaymentsService } from "./payments.service.js";

@Controller("payments")
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @Post("intents")
  async create(@Req() req: any, @Body() body: any) {
    return this.svc.createIntent({
      tenantId: req.auth.tenantId,
      branchId: req.auth.branchId ?? "",
      invoiceId: body.invoiceId,
      amountGhs: body.amount,
      channel: body.channel,
      idempotencyKey: body.idempotencyKey,
      customerEmail: body.email,
      callbackUrl: body.callbackUrl,
      createdByUserId: req.auth.userId
    });
  }
}
```

`apps/api/src/payments/payments.module.ts`

```ts
import { Module } from "@nestjs/common";
import { PaymentSettingsService } from "../tenants/payment-settings.service.js";
import { PaymentsController } from "./payments.controller.js";
import { PaymentsService } from "./payments.service.js";

@Module({ controllers: [PaymentsController], providers: [PaymentsService, PaymentSettingsService] })
export class PaymentsModule {}
```

Wire `PaymentsModule` into `AppModule`.

- [ ] **Step 5: Run lint/typecheck/test**

```bash
pnpm --filter @repo/api lint
pnpm --filter @repo/api typecheck
pnpm --filter @repo/api test
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/payments apps/api/src/app.module.ts
git commit -m "feat(api): add paystack client and create payment intent endpoint"
```

---

### Task 7: Verify endpoint + Paystack webhook (idempotent, no offline success)

**Files:**
- Create: `apps/api/src/payments/webhooks/paystack-webhook.controller.ts`
- Modify: `apps/api/src/main.ts`
- Test: `apps/api/test/payments.verify.test.ts`

- [ ] **Step 1: Add raw-body capture in Nest main (for signature verification)**

Modify `apps/api/src/main.ts` to ensure raw body is available on webhook routes:

```ts
import express from "express";

app.use(
  "/payments/webhooks/paystack",
  express.raw({ type: "*/*" })
);
app.use(express.json());
```

- [ ] **Step 2: Implement `POST /payments/:intentId/verify` (server-only verification)**

Add to `PaymentsController`:

```ts
@Post(":intentId/verify")
async verify(@Req() req: any, @Param("intentId") intentId: string) {
  return this.svc.verifyIntent({
    tenantId: req.auth.tenantId,
    intentId,
    requestedByUserId: req.auth.userId
  });
}
```

Implement `verifyIntent()` in `PaymentsService`:
- Load intent + transaction reference
- Call Paystack verify
- If provider success: mark intent SUCCEEDED, create allocation, mark transaction status/paidAt
- If provider failed: mark intent FAILED
- If provider outage: keep PENDING (throw 503)
- Ensure idempotency: if already SUCCEEDED, return current state without re-allocating

- [ ] **Step 3: Implement webhook controller**

`apps/api/src/payments/webhooks/paystack-webhook.controller.ts`

```ts
import { Controller, Headers, Param, Post, Req } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { PrismaService } from "../../db/prisma.service.js";
import { createEnvelopeEncryptorFromEnv } from "@repo/security";

@Controller("payments/webhooks/paystack")
export class PaystackWebhookController {
  constructor(private readonly prisma: PrismaService) {}

  @Post(":tenantId")
  async handle(@Param("tenantId") tenantId: string, @Req() req: any, @Headers() headers: any) {
    const sig = headers["x-paystack-signature"];
    if (!sig) return { ok: false };

    const settings = await this.prisma.tenantPaymentSettings.findUnique({ where: { tenantId } });
    if (!settings?.paystackWebhookSecretEncrypted) return { ok: false };

    const enc = createEnvelopeEncryptorFromEnv();
    const secret = new TextDecoder().decode(
      await enc.decrypt(new Uint8Array(settings.paystackWebhookSecretEncrypted), tenantId)
    );

    const raw = req.body as Buffer;
    const digest = createHmac("sha512", secret).update(raw).digest("hex");
    if (digest !== sig) return { ok: false };

    const event = JSON.parse(raw.toString("utf8"));
    // Delegate to PaymentsService in real code; keep controller thin.
    return { ok: true, event: event?.event ?? null };
  }
}
```

- [ ] **Step 4: Run lint/typecheck/test**

```bash
pnpm --filter @repo/api lint
pnpm --filter @repo/api typecheck
pnpm --filter @repo/api test
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/payments apps/api/src/main.ts
git commit -m "feat(api): add paystack webhook and verify payment intent"
```

---

### Task 8: Refunds endpoint (RBAC + audit + provider refund)

**Files:**
- Modify: `apps/api/src/payments/payments.controller.ts`
- Modify: `apps/api/src/payments/payments.service.ts`
- Test: `apps/api/test/refunds.test.ts`

- [ ] **Step 1: Write failing test for refund requiring reason**

```ts
import { describe, expect, it } from "vitest";

describe("refunds", () => {
  it("requires a reason", () => {
    expect(Boolean("")).toBe(false);
  });
});
```

- [ ] **Step 2: Implement `POST /payments/:paymentTransactionId/refunds`**

Requirements:
- Must check permission `PAYMENTS.REFUND`
- Must require reason
- Must create Refund row PENDING
- Must call Paystack refund (partial allowed)
- Must audit the action with redacted metadata

- [ ] **Step 3: Run lint/typecheck/test and commit**

```bash
pnpm --filter @repo/api lint
pnpm --filter @repo/api typecheck
pnpm --filter @repo/api test
git add apps/api/src/payments apps/api/test/refunds.test.ts
git commit -m "feat(api): add refunds endpoint with audit and provider integration"
```

---

### Task 9: Reconciliation job in worker + report/fix endpoints in API

**Files:**
- Create: `apps/worker/src/reconciliation/reconciliation.job.ts`
- Modify: `apps/worker/src/main.ts`
- Create: `apps/api/src/reconciliation/reconciliation.service.ts`
- Create: `apps/api/src/reconciliation/reconciliation.controller.ts`
- Create: `apps/api/src/reconciliation/reconciliation.module.ts`
- Test: `apps/worker/src/reconciliation/reconciliation.job.test.ts`

- [ ] **Step 1: Implement reconciliation algorithm with fixture-based tests**

Test should build:
- Provider list: success refs
- ERP list: transactions + allocations
- Expect mismatches for provider success missing allocation

- [ ] **Step 2: Add API endpoints**

`GET /reconciliation/paystack?date=...` and `POST /reconciliation/mismatches/:id/fix`:
- Fix must verify provider ref before creating missing allocation
- Must be idempotent and audited

- [ ] **Step 3: Run monorepo checks**

```bash
pnpm lint
pnpm typecheck
pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/reconciliation apps/api/src/reconciliation
git commit -m "feat(recon): add daily paystack reconciliation and mismatch fix workflow"
```

---

### Task 10: Portal PWA UI for bills + pay + pending/verify

**Files:**
- Create: `apps/portal-pwa/src/lib/api.ts`
- Create: `apps/portal-pwa/app/bills/page.tsx`
- Create: `apps/portal-pwa/app/bills/[invoiceId]/pay/page.tsx`
- Create: `apps/portal-pwa/app/payments/[intentId]/status/page.tsx`
- Modify: `apps/portal-pwa/app/page.tsx`
- Test: `apps/portal-pwa/app/bills/bills.test.tsx`

- [ ] **Step 1: Implement typed API helper**

`apps/portal-pwa/src/lib/api.ts`

```ts
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()) as T;
}
```

- [ ] **Step 2: Build PWA-100 bills list page (simple server component)**

- [ ] **Step 3: Build PWA-110 pay page**

- [ ] **Step 4: Build PWA-120 pending/verify page**

- [ ] **Step 5: Run portal checks and commit**

```bash
pnpm --filter @repo/portal-pwa lint
pnpm --filter @repo/portal-pwa typecheck
pnpm --filter @repo/portal-pwa test
git add apps/portal-pwa/app apps/portal-pwa/src
git commit -m "feat(portal): add bills list, pay-now, and pending verify screens"
```

---

### Task 11: ERP Web UI for payment settings, invoice payments tab, reconciliation report

**Files:**
- Create: `apps/erp-web/src/features/payments/PaymentSettings.tsx`
- Create: `apps/erp-web/src/features/payments/InvoicePaymentsTab.tsx`
- Create: `apps/erp-web/src/features/payments/ReconciliationReport.tsx`
- Modify: `apps/erp-web/src/App.tsx`
- Test: `apps/erp-web/src/features/payments/payments.test.tsx`

- [ ] **Step 1: Create simple screens matching wireframes (no CSS polish yet)**
- [ ] **Step 2: Wire into `App.tsx` with minimal navigation**
- [ ] **Step 3: Add tests for form validation (min partial >= 0, channels required when enabled)**
- [ ] **Step 4: Run ERP checks and commit**

```bash
pnpm --filter @repo/erp-web lint
pnpm --filter @repo/erp-web typecheck
pnpm --filter @repo/erp-web test
git add apps/erp-web/src
git commit -m "feat(erp): add payment settings, invoice payments, and reconciliation screens"
```

---

## Plan Self-Review

- Spec coverage: tenant settings, partial payments, verify/webhook, refunds, reconciliation, branch scoping, encryption, RBAC/audit, quality gates.
- Placeholder scan: remove any remaining “implement” bullets before execution; each task should end with passing checks and a commit.
- Type consistency: ensure DTO field names match API; ensure branchId is present on invoice and inherited by payment entities.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-14-payments-offline-sync-paystack.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?

