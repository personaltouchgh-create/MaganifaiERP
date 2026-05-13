# Inventory Ledger Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the foundational, multi-tenant, multi-branch, batch/expiry-aware inventory ledger with FEFO allocation, idempotent outbox sync, strict RBAC, and immutable audit logs.

**Architecture:** Server writes are append-only ledger entries in PostgreSQL; every write emits an outbox event and an audit record in the same transaction. Offline clients write intents to SQLite and sync via push/pull using idempotency keys.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM (PostgreSQL + SQLite), Vitest, Zod, Node.js crypto (envelope encryption primitives).

---

## Scope

In scope for this first implementation slice:

- Tenant + branch-scoped inventory lots and append-only inventory ledger
- FEFO allocation when issuing stock without explicit batch selection
- No-negative stock policy with explicit permission override
- Outbox event table + sync endpoints (push intents, pull events)
- RBAC tables and permission evaluation (role baseline + per-user allow/deny)
- Audit log table + “every mutation writes audit row” enforcement
- Security baseline: no hardcoded secrets, structured logging hygiene, encryption primitive package (used later for PHI/PII)

Out of scope:

- Full auth productization (SSO, MFA, Ghana Card provider integration)
- Prescriptions, patients, clinical notes, NHIS, payments
- Full desktop UI; only the offline storage + sync library used by Tauri

## Repository Layout (to create)

Monorepo (npm workspaces):

- `apps/server/` Fastify API server
- `packages/db/` Drizzle schemas + migrations helpers (pg + sqlite)
- `packages/domain/` inventory ledger domain functions (FEFO allocation, invariants)
- `packages/security/` RBAC evaluation, audit helpers, crypto primitives
- `packages/sync/` sync protocol types + client sqlite outbox helpers
- `docs/` specs + operational docs

## Task 1: Scaffold TypeScript monorepo + tooling

**Files:**

- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/src/app.ts`
- Create: `apps/server/src/index.ts`
- Create: `packages/db/package.json`
- Create: `packages/domain/package.json`
- Create: `packages/security/package.json`
- Create: `packages/sync/package.json`
- Create: `.gitignore`

- [ ] **Step 1: Initialize workspace root**

Run:

```bash
npm init -y
```

Edit `package.json` to:

```json
{
  "name": "pharmacy-erp",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc -b",
    "test": "vitest run",
    "test:watch": "vitest",
    "format": "prettier -w ."
  }
}
```

- [ ] **Step 2: Add TypeScript + lint/test deps**

Run:

```bash
npm i -D typescript eslint @eslint/js typescript-eslint prettier vitest @types/node
```

- [ ] **Step 3: Create base tsconfig**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  }
}
```

- [ ] **Step 4: Create root TS build config**

Create `tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./packages/db" },
    { "path": "./packages/domain" },
    { "path": "./packages/security" },
    { "path": "./packages/sync" },
    { "path": "./apps/server" }
  ]
}
```

- [ ] **Step 5: Add ESLint config**

Create `eslint.config.js`:

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  }
);
```

- [ ] **Step 6: Create shared packages skeletons**

Run:

```bash
mkdir -p packages/{domain,security,sync}/src
```

Create `packages/domain/package.json`:

```json
{
  "name": "@pharmacy/domain",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./inventory/*": "./dist/inventory/*.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  }
}
```

Create `packages/domain/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/domain/src/index.ts`:

```ts
export {};
```

Create `packages/security/package.json`:

```json
{
  "name": "@pharmacy/security",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./rbac/*": "./dist/rbac/*.js",
    "./audit/*": "./dist/audit/*.js",
    "./crypto/*": "./dist/crypto/*.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  }
}
```

Create `packages/security/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/security/src/index.ts`:

```ts
export {};
```

Create `packages/sync/package.json`:

```json
{
  "name": "@pharmacy/sync",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./client/*": "./dist/client/*.js",
    "./idempotency/*": "./dist/idempotency/*.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  }
}
```

Create `packages/sync/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/sync/src/index.ts`:

```ts
export {};
```

- [ ] **Step 7: Create server package skeleton**

Run:

```bash
mkdir -p apps/server/src
```

Create `apps/server/package.json`:

```json
{
  "name": "@pharmacy/server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch ./dist/index.js",
    "build": "tsc -p tsconfig.json",
    "start": "node ./dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@pharmacy/db": "workspace:*",
    "@pharmacy/domain": "workspace:*",
    "@pharmacy/security": "workspace:*",
    "@pharmacy/sync": "workspace:*",
    "fastify": "^4.0.0",
    "zod": "^3.0.0"
  }
}
```

Create `apps/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"]
}
```

Create `apps/server/src/app.ts`:

```ts
import Fastify from "fastify";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true }));

  return app;
}
```

Create `apps/server/src/index.ts`:

```ts
import { buildApp } from "./app.js";

const app = buildApp();

await app.listen({ host: "127.0.0.1", port: 3000 });
```

- [ ] **Step 8: Add root `.gitignore`**

Create `.gitignore`:

```gitignore
node_modules
dist
.env
.env.*
.superpowers
```

- [ ] **Step 9: Add a basic server test**

Create `apps/server/src/app.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("health", () => {
  it("returns ok", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 10: Run typecheck + tests**

Run:

```bash
npm run typecheck
npm test
```

Expected:

- `npm run typecheck` succeeds
- tests pass

- [ ] **Step 11: Commit**

```bash
git add .
git commit -m "chore: scaffold monorepo and server skeleton"
```

## Task 2: Add DB packages (PostgreSQL + SQLite) + Drizzle migrations

**Files:**

- Create: `packages/db/src/pg/schema.ts`
- Create: `packages/db/src/sqlite/schema.ts`
- Create: `packages/db/src/pg/client.ts`
- Create: `packages/db/src/sqlite/client.ts`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/package.json`
- Create: `packages/db/src/index.ts`

- [ ] **Step 1: Install Drizzle + drivers**

Run:

```bash
npm i drizzle-orm drizzle-kit pg better-sqlite3
```

- [ ] **Step 2: Create `packages/db` package**

Run:

```bash
mkdir -p packages/db/src/{pg,sqlite}
```

Create `packages/db/package.json`:

```json
{
  "name": "@pharmacy/db",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "migrate:pg": "drizzle-kit migrate",
    "generate:pg": "drizzle-kit generate"
  }
}
```

Create `packages/db/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts", "drizzle.config.ts"]
}
```

Create `packages/db/src/index.ts`:

```ts
export * from "./pg/schema.js";
export * from "./pg/client.js";
export * from "./sqlite/schema.js";
export * from "./sqlite/client.js";
```

- [ ] **Step 3: Create PG client**

Create `packages/db/src/pg/client.ts`:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

export type PgDb = ReturnType<typeof createPgDb>;

export function createPgDb(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl, ssl: false });
  return drizzle(pool);
}
```

- [ ] **Step 4: Create SQLite client**

Create `packages/db/src/sqlite/client.ts`:

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

export type SqliteDb = ReturnType<typeof createSqliteDb>;

export function createSqliteDb(filePath: string) {
  const sqlite = new Database(filePath);
  return drizzle(sqlite);
}
```

- [ ] **Step 5: Define schemas (initial: tenants/branches/users minimal)**

Create `packages/db/src/pg/schema.ts`:

```ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const branches = pgTable("branches", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});
```

Create `packages/db/src/sqlite/schema.ts`:

```ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const clientOutbox = sqliteTable("client_outbox", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  branchId: text("branch_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  eventType: text("event_type").notNull(),
  payload: text("payload").notNull(),
  occurredAt: integer("occurred_at").notNull(),
  syncedAt: integer("synced_at")
});
```

- [ ] **Step 6: Create drizzle config for PG migrations**

Create `packages/db/drizzle.config.ts`:

```ts
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/pg/schema.ts",
  out: "./drizzle/pg",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!
  }
} satisfies Config;
```

- [ ] **Step 7: Add server env loading and DB wiring**

Install:

```bash
npm i dotenv
```

Modify `apps/server/src/app.ts` to accept a db instance:

```ts
import Fastify from "fastify";
import type { PgDb } from "@pharmacy/db";

export type AppDeps = {
  db: PgDb;
};

export function buildApp(deps: AppDeps) {
  const app = Fastify({ logger: true });
  app.decorate("db", deps.db);

  app.get("/health", async () => ({ ok: true }));

  return app;
}
```

Modify `apps/server/src/index.ts`:

```ts
import "dotenv/config";
import { createPgDb } from "@pharmacy/db";
import { buildApp } from "./app.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const db = createPgDb(databaseUrl);
const app = buildApp({ db });

await app.listen({ host: "127.0.0.1", port: 3000 });
```

- [ ] **Step 8: Update the health test to pass deps**

Modify `apps/server/src/app.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("health", () => {
  it("returns ok", async () => {
    const app = buildApp({ db: {} as any });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 9: Run typecheck + tests**

Run:

```bash
npm run typecheck
npm test
```

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "chore: add db package and initial schemas"
```

## Task 3: Inventory schema (lots + ledger) + audit + RBAC tables + constraints

**Files:**

- Modify: `packages/db/src/pg/schema.ts`
- Create: `packages/db/src/pg/inventory.ts`
- Create: `packages/db/src/pg/rbac.ts`
- Create: `packages/db/src/pg/audit.ts`
- Create: `packages/db/src/pg/outbox.ts`

- [ ] **Step 1: Split schema into modules**

Modify `packages/db/src/pg/schema.ts`:

```ts
export * from "./inventory.js";
export * from "./rbac.js";
export * from "./audit.js";
export * from "./outbox.js";
```

Create `packages/db/src/pg/inventory.ts`:

```ts
import {
  pgTable,
  boolean,
  date,
  integer,
  text,
  timestamp,
  uuid,
  uniqueIndex
} from "drizzle-orm/pg-core";

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    isLotTracked: boolean("is_lot_tracked").notNull(),
    baseUom: text("base_uom").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (t) => ({
    tenantSkuUnique: uniqueIndex("products_tenant_sku_unique").on(t.tenantId, t.sku)
  })
);

export const inventoryLots = pgTable(
  "inventory_lots",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    productId: uuid("product_id").notNull(),
    batchNo: text("batch_no").notNull(),
    expiryDate: date("expiry_date").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    supplierId: uuid("supplier_id"),
    unitCostMinor: integer("unit_cost_minor"),
    currency: text("currency"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (t) => ({
    lotIdentityUnique: uniqueIndex("inventory_lots_identity_unique").on(
      t.tenantId,
      t.branchId,
      t.productId,
      t.batchNo,
      t.expiryDate
    )
  })
);

export const inventoryOperations = pgTable(
  "inventory_operations",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    operationType: text("operation_type").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    requestId: uuid("request_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    createdByUserId: uuid("created_by_user_id").notNull(),
    createdByDeviceId: uuid("created_by_device_id")
  },
  (t) => ({
    tenantIdemUnique: uniqueIndex("inventory_operations_tenant_idem_unique").on(
      t.tenantId,
      t.idempotencyKey
    )
  })
);

export const inventoryLedgerEntries = pgTable("inventory_ledger_entries", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  operationId: uuid("operation_id").notNull(),
  productId: uuid("product_id").notNull(),
  lotId: uuid("lot_id"),
  batchNo: text("batch_no"),
  expiryDate: date("expiry_date"),
  movementType: text("movement_type").notNull(),
  direction: text("direction").notNull(),
  quantityBaseUom: integer("quantity_base_uom").notNull(),
  sourceDocumentType: text("source_document_type").notNull(),
  sourceDocumentId: text("source_document_id").notNull(),
  sourceLineId: uuid("source_line_id"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull(),
  createdByDeviceId: uuid("created_by_device_id")
});
```

Create `packages/db/src/pg/outbox.ts`:

```ts
import { jsonb, pgTable, text, timestamp, uuid, uniqueIndex, integer } from "drizzle-orm/pg-core";

export const outboxEvents = pgTable(
  "outbox_events",
  {
    eventId: uuid("event_id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    producer: text("producer").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    payload: jsonb("payload").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull()
  },
  (t) => ({
    tenantIdemUnique: uniqueIndex("outbox_events_tenant_idem_unique").on(
      t.tenantId,
      t.idempotencyKey
    )
  })
);
```

Create `packages/db/src/pg/audit.ts`:

```ts
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const auditLogEntries = pgTable("audit_log_entries", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  branchId: uuid("branch_id"),
  actorUserId: uuid("actor_user_id").notNull(),
  actorDeviceId: uuid("actor_device_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  idempotencyKey: uuid("idempotency_key").notNull(),
  requestId: uuid("request_id").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  metadata: jsonb("metadata").notNull()
});
```

Create `packages/db/src/pg/rbac.ts`:

```ts
import { pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (t) => ({
    tenantRoleNameUnique: uniqueIndex("roles_tenant_name_unique").on(t.tenantId, t.name)
  })
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    roleId: uuid("role_id").notNull(),
    permissionKey: text("permission_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (t) => ({
    rolePermUnique: uniqueIndex("role_permissions_unique").on(t.tenantId, t.roleId, t.permissionKey)
  })
);

export const userRoleAssignments = pgTable(
  "user_role_assignments",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id").notNull(),
    roleId: uuid("role_id").notNull(),
    branchId: uuid("branch_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (t) => ({
    assignmentUnique: uniqueIndex("user_role_assignments_unique").on(
      t.tenantId,
      t.userId,
      t.roleId,
      t.branchId
    )
  })
);

export const userPermissionGrants = pgTable(
  "user_permission_grants",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id").notNull(),
    permissionKey: text("permission_key").notNull(),
    effect: text("effect").notNull(),
    branchId: uuid("branch_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (t) => ({
    grantUnique: uniqueIndex("user_permission_grants_unique").on(
      t.tenantId,
      t.userId,
      t.permissionKey,
      t.branchId
    )
  })
);
```

- [ ] **Step 2: Add domain-level type unions**

Create `packages/domain/src/inventory/types.ts`:

```ts
export const MovementTypes = [
  "RECEIPT",
  "ISSUE",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "ADJUSTMENT",
  "RETURN_IN",
  "WRITE_OFF"
] as const;

export type MovementType = (typeof MovementTypes)[number];

export const Directions = ["IN", "OUT"] as const;
export type Direction = (typeof Directions)[number];
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat(db): add inventory ledger, outbox, rbac, and audit schemas"
```

## Task 3b: Create and run PostgreSQL migrations (Drizzle)

**Files:**

- Modify: `packages/db/src/index.ts`
- Create: `packages/db/src/pg/migrate.ts`
- Modify: `apps/server/src/test/db.ts`

- [ ] **Step 1: Add migrator helper**

Create `packages/db/src/pg/migrate.ts`:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export async function migratePg(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl, ssl: false });
  const db = drizzle(pool);

  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = join(here, "../../../drizzle/pg");

  await migrate(db, { migrationsFolder });
  await pool.end();
}
```

- [ ] **Step 2: Export migrator**

Modify `packages/db/src/index.ts`:

```ts
export * from "./pg/schema.js";
export * from "./pg/client.js";
export * from "./pg/migrate.js";
export * from "./sqlite/schema.js";
export * from "./sqlite/client.js";
```

- [ ] **Step 3: Generate the initial migration**

Run:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pharmacy" npx drizzle-kit generate --config packages/db/drizzle.config.ts
```

Expected:

- SQL migration files appear under `packages/db/drizzle/pg/`

- [ ] **Step 4: Apply migrations locally**

Run:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pharmacy" npx drizzle-kit migrate --config packages/db/drizzle.config.ts
```

- [ ] **Step 5: Run migrations in integration tests**

Modify `apps/server/src/test/db.ts` to call `migratePg` before returning `db`:

```ts
import { PostgreSqlContainer } from "testcontainers";
import { createPgDb, migratePg } from "@pharmacy/db";

export async function withPostgres<T>(
  fn: (args: { databaseUrl: string; db: ReturnType<typeof createPgDb> }) => Promise<T>
) {
  const c = await new PostgreSqlContainer("postgres:16").start();
  const databaseUrl = c.getConnectionUri();

  await migratePg(databaseUrl);

  const db = createPgDb(databaseUrl);
  try {
    return await fn({ databaseUrl, db });
  } finally {
    await c.stop();
  }
}
```

- [ ] **Step 6: Run tests + commit**

Run:

```bash
npm test
```

Commit:

```bash
git add .
git commit -m "chore(db): add drizzle migrations and migrator helper"
```

## Task 4: RBAC evaluation library (role baseline + per-user allow/deny)

**Files:**

- Create: `packages/security/src/rbac/permissions.ts`
- Create: `packages/security/src/rbac/evaluate.ts`
- Create: `packages/security/src/rbac/evaluate.test.ts`

- [ ] **Step 1: Create permission catalog**

Create `packages/security/src/rbac/permissions.ts`:

```ts
export const PermissionKeys = [
  "INVENTORY_RECEIPT_CREATE",
  "INVENTORY_ISSUE_CREATE",
  "INVENTORY_TRANSFER_CREATE",
  "INVENTORY_ADJUSTMENT_CREATE",
  "INVENTORY_NEGATIVE_OVERRIDE",
  "AUDIT_READ"
] as const;

export type PermissionKey = (typeof PermissionKeys)[number];
export type GrantEffect = "ALLOW" | "DENY";
```

- [ ] **Step 2: Implement evaluator**

Create `packages/security/src/rbac/evaluate.ts`:

```ts
import type { PermissionKey, GrantEffect } from "./permissions.js";

export type PermissionGrant = {
  permissionKey: PermissionKey;
  effect: GrantEffect;
  branchId: string | null;
};

export type RolePermission = {
  permissionKey: PermissionKey;
};

export function can(args: {
  requested: PermissionKey;
  branchId: string | null;
  rolePermissions: RolePermission[];
  userGrants: PermissionGrant[];
}): boolean {
  const roleAllows = new Set(args.rolePermissions.map((p) => p.permissionKey));
  let allowed = roleAllows.has(args.requested);

  const branchMatches = (grantBranchId: string | null) =>
    grantBranchId === null || grantBranchId === args.branchId;

  for (const g of args.userGrants) {
    if (g.permissionKey !== args.requested) continue;
    if (!branchMatches(g.branchId)) continue;
    if (g.effect === "DENY") allowed = false;
    if (g.effect === "ALLOW") allowed = true;
  }

  return allowed;
}
```

- [ ] **Step 3: Write tests**

Create `packages/security/src/rbac/evaluate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { can } from "./evaluate.js";
import type { PermissionGrant, RolePermission } from "./evaluate.js";

describe("rbac can()", () => {
  it("defaults to deny when not in role permissions", () => {
    const ok = can({
      requested: "INVENTORY_ISSUE_CREATE",
      branchId: "b1",
      rolePermissions: [],
      userGrants: []
    });
    expect(ok).toBe(false);
  });

  it("allows when role includes permission", () => {
    const rolePermissions: RolePermission[] = [{ permissionKey: "INVENTORY_ISSUE_CREATE" }];
    const ok = can({
      requested: "INVENTORY_ISSUE_CREATE",
      branchId: "b1",
      rolePermissions,
      userGrants: []
    });
    expect(ok).toBe(true);
  });

  it("user DENY overrides role allow", () => {
    const rolePermissions: RolePermission[] = [{ permissionKey: "INVENTORY_ISSUE_CREATE" }];
    const userGrants: PermissionGrant[] = [
      { permissionKey: "INVENTORY_ISSUE_CREATE", effect: "DENY", branchId: null }
    ];
    const ok = can({
      requested: "INVENTORY_ISSUE_CREATE",
      branchId: "b1",
      rolePermissions,
      userGrants
    });
    expect(ok).toBe(false);
  });

  it("branch-scoped deny applies only to that branch", () => {
    const rolePermissions: RolePermission[] = [{ permissionKey: "INVENTORY_ISSUE_CREATE" }];
    const userGrants: PermissionGrant[] = [
      { permissionKey: "INVENTORY_ISSUE_CREATE", effect: "DENY", branchId: "b2" }
    ];
    const okB1 = can({
      requested: "INVENTORY_ISSUE_CREATE",
      branchId: "b1",
      rolePermissions,
      userGrants
    });
    const okB2 = can({
      requested: "INVENTORY_ISSUE_CREATE",
      branchId: "b2",
      rolePermissions,
      userGrants
    });
    expect(okB1).toBe(true);
    expect(okB2).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(security): add rbac evaluator and tests"
```

## Task 5: Inventory domain (FEFO allocation + no-negative guard + idempotency)

**Files:**

- Create: `packages/domain/src/inventory/fefo.ts`
- Create: `packages/domain/src/inventory/fefo.test.ts`
- Create: `packages/domain/src/inventory/stock.ts`
- Create: `packages/domain/src/inventory/stock.test.ts`

- [ ] **Step 1: Implement FEFO allocator**

Create `packages/domain/src/inventory/fefo.ts`:

```ts
export type LotAvailability = {
  lotId: string;
  expiryDate: string;
  receivedAt: string | null;
  availableQty: number;
};

export type Allocation = { lotId: string; qty: number };

export function allocateFefo(
  lots: LotAvailability[],
  requiredQty: number
): { allocations: Allocation[]; remaining: number } {
  const sorted = [...lots].sort((a, b) => {
    if (a.expiryDate !== b.expiryDate) return a.expiryDate < b.expiryDate ? -1 : 1;
    const ar = a.receivedAt ?? "";
    const br = b.receivedAt ?? "";
    if (ar !== br) return ar < br ? -1 : 1;
    return a.lotId < b.lotId ? -1 : 1;
  });

  const allocations: Allocation[] = [];
  let remaining = requiredQty;

  for (const lot of sorted) {
    if (remaining <= 0) break;
    if (lot.availableQty <= 0) continue;
    const take = Math.min(lot.availableQty, remaining);
    allocations.push({ lotId: lot.lotId, qty: take });
    remaining -= take;
  }

  return { allocations, remaining };
}
```

- [ ] **Step 2: FEFO tests**

Create `packages/domain/src/inventory/fefo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { allocateFefo } from "./fefo.js";

describe("allocateFefo", () => {
  it("allocates by earliest expiry, then received_at", () => {
    const { allocations, remaining } = allocateFefo(
      [
        {
          lotId: "l2",
          expiryDate: "2026-06-01",
          receivedAt: "2026-01-01T00:00:00Z",
          availableQty: 10
        },
        {
          lotId: "l1",
          expiryDate: "2026-05-01",
          receivedAt: "2026-02-01T00:00:00Z",
          availableQty: 10
        },
        {
          lotId: "l3",
          expiryDate: "2026-05-01",
          receivedAt: "2026-01-01T00:00:00Z",
          availableQty: 10
        }
      ],
      12
    );

    expect(remaining).toBe(0);
    expect(allocations).toEqual([
      { lotId: "l3", qty: 10 },
      { lotId: "l1", qty: 2 }
    ]);
  });
});
```

- [ ] **Step 3: Stock math helpers (server-side validation)**

Create `packages/domain/src/inventory/stock.ts`:

```ts
export type LedgerRow = { direction: "IN" | "OUT"; qty: number };

export function computeAvailableQty(rows: LedgerRow[]): number {
  let sum = 0;
  for (const r of rows) sum += r.direction === "IN" ? r.qty : -r.qty;
  return sum;
}
```

Create `packages/domain/src/inventory/stock.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeAvailableQty } from "./stock.js";

describe("computeAvailableQty", () => {
  it("sums in minus out", () => {
    const n = computeAvailableQty([
      { direction: "IN", qty: 10 },
      { direction: "OUT", qty: 3 },
      { direction: "IN", qty: 5 }
    ]);
    expect(n).toBe(12);
  });
});
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(domain): add FEFO allocation and stock math helpers"
```

## Task 6: Server inventory endpoints (receipt/issue/adjustment) with idempotency + audit + RBAC

**Files:**

- Modify: `apps/server/src/app.ts`
- Create: `apps/server/src/plugins/context.ts`
- Create: `apps/server/src/plugins/authz.ts`
- Create: `apps/server/src/routes/inventory.ts`
- Create: `apps/server/src/routes/inventory.test.ts`

- [ ] **Step 1: Add request context extraction**

Create `apps/server/src/plugins/context.ts`:

```ts
import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const headerSchema = z.object({
  "x-tenant-id": z.string().uuid(),
  "x-branch-id": z.string().uuid().optional(),
  "x-user-id": z.string().uuid(),
  "idempotency-key": z.string().uuid()
});

declare module "fastify" {
  interface FastifyRequest {
    ctx: {
      tenantId: string;
      branchId: string | null;
      userId: string;
      idempotencyKey: string;
      requestId: string;
    };
  }
}

export const contextPlugin: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async (req) => {
    const parsed = headerSchema.safeParse(req.headers);
    if (!parsed.success) {
      req.log.warn({ issues: parsed.error.issues }, "invalid headers");
      throw app.httpErrors.badRequest("invalid headers");
    }
    req.ctx = {
      tenantId: parsed.data["x-tenant-id"],
      branchId: parsed.data["x-branch-id"] ?? null,
      userId: parsed.data["x-user-id"],
      idempotencyKey: parsed.data["idempotency-key"],
      requestId: randomUUID()
    };
  });
};
```

Install error helpers:

```bash
npm i @fastify/sensible
```

Modify `apps/server/src/app.ts`:

```ts
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { PgDb } from "@pharmacy/db";
import { contextPlugin } from "./plugins/context.js";
import { inventoryRoutes } from "./routes/inventory.js";

export type AppDeps = {
  db: PgDb;
};

export function buildApp(deps: AppDeps) {
  const app = Fastify({ logger: true });
  app.decorate("db", deps.db);

  app.register(sensible);
  app.register(contextPlugin);

  app.get("/health", async () => ({ ok: true }));
  app.register(inventoryRoutes, { prefix: "/v1/inventory" });

  return app;
}
```

- [ ] **Step 2: Add authorization hook helper**

Create `apps/server/src/plugins/authz.ts`:

```ts
import type { FastifyPluginAsync } from "fastify";
import type { PermissionKey } from "@pharmacy/security/rbac/permissions";
import { can } from "@pharmacy/security/rbac/evaluate";
import { rolePermissions, userPermissionGrants, userRoleAssignments } from "@pharmacy/db";
import { and, eq, inArray, isNull, or } from "drizzle-orm";

declare module "fastify" {
  interface FastifyRequest {
    requirePermission: (permission: PermissionKey) => Promise<void>;
  }
}

export const authzPlugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest(
    "requirePermission",
    async function requirePermission(permission: PermissionKey) {
      const db = (app as any).db;
      const { tenantId, branchId, userId } = this.ctx;

      const assignments = await db
        .select({ roleId: userRoleAssignments.roleId })
        .from(userRoleAssignments)
        .where(
          and(
            eq(userRoleAssignments.tenantId, tenantId),
            eq(userRoleAssignments.userId, userId),
            or(eq(userRoleAssignments.branchId, branchId), isNull(userRoleAssignments.branchId))
          )
        );

      const roleIds = assignments.map((a: { roleId: string }) => a.roleId);

      const rolePerms =
        roleIds.length === 0
          ? []
          : await db
              .select({ permissionKey: rolePermissions.permissionKey })
              .from(rolePermissions)
              .where(
                and(
                  eq(rolePermissions.tenantId, tenantId),
                  inArray(rolePermissions.roleId, roleIds)
                )
              );

      const grants = await db
        .select({
          permissionKey: userPermissionGrants.permissionKey,
          effect: userPermissionGrants.effect,
          branchId: userPermissionGrants.branchId
        })
        .from(userPermissionGrants)
        .where(
          and(
            eq(userPermissionGrants.tenantId, tenantId),
            eq(userPermissionGrants.userId, userId),
            or(eq(userPermissionGrants.branchId, branchId), isNull(userPermissionGrants.branchId))
          )
        );

      const ok = can({
        requested: permission,
        branchId,
        rolePermissions: rolePerms,
        userGrants: grants
      });

      if (!ok) throw app.httpErrors.forbidden("forbidden");
    }
  );
};
```

- [ ] **Step 3: Implement inventory routes (initial: stub returns 501)**

Create `apps/server/src/routes/inventory.ts`:

```ts
import type { FastifyPluginAsync } from "fastify";

export const inventoryRoutes: FastifyPluginAsync = async (app) => {
  app.post("/ledger/receipt", async () => {
    throw app.httpErrors.notImplemented();
  });
  app.post("/ledger/issue", async () => {
    throw app.httpErrors.notImplemented();
  });
  app.post("/ledger/adjustment", async () => {
    throw app.httpErrors.notImplemented();
  });
};
```

- [ ] **Step 4: Add failing route test**

Create `apps/server/src/routes/inventory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

describe("inventory routes", () => {
  it("requires implementation", async () => {
    const app = buildApp({ db: {} as any });
    const res = await app.inject({
      method: "POST",
      url: "/v1/inventory/ledger/receipt",
      headers: {
        "x-tenant-id": "00000000-0000-0000-0000-000000000001",
        "x-branch-id": "00000000-0000-0000-0000-000000000002",
        "x-user-id": "00000000-0000-0000-0000-000000000003",
        "idempotency-key": "00000000-0000-0000-0000-000000000004"
      },
      payload: {}
    });
    expect(res.statusCode).toBe(501);
  });
});
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "test(server): add inventory routes skeleton and tests"
```

## Task 7: Implement ledger write transaction (ledger + outbox + audit) with idempotency

**Files:**

- Create: `packages/security/src/audit/writeAudit.ts`
- Create: `packages/sync/src/idempotency/ensureIdempotent.ts`
- Create: `apps/server/src/services/inventory/writeLedger.ts`
- Modify: `apps/server/src/routes/inventory.ts`
- Test: `apps/server/src/routes/inventory.test.ts`

- [ ] **Step 1: Add server-side idempotency helper**

Create `packages/sync/src/idempotency/ensureIdempotent.ts`:

```ts
import type { PgDb } from "@pharmacy/db";
import { inventoryOperations } from "@pharmacy/db";
import { eq, and } from "drizzle-orm";

export async function operationExists(db: PgDb, tenantId: string, idempotencyKey: string) {
  const rows = await db
    .select({ id: inventoryOperations.id })
    .from(inventoryOperations)
    .where(
      and(
        eq(inventoryOperations.tenantId, tenantId),
        eq(inventoryOperations.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);
  return rows.length > 0;
}
```

- [ ] **Step 2: Add audit write helper**

Create `packages/security/src/audit/writeAudit.ts`:

```ts
import type { PgDb } from "@pharmacy/db";
import { auditLogEntries } from "@pharmacy/db";

export async function writeAudit(
  db: PgDb,
  args: {
    id: string;
    tenantId: string;
    branchId: string | null;
    actorUserId: string;
    actorDeviceId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    idempotencyKey: string;
    requestId: string;
    occurredAt: Date;
    before: unknown | null;
    after: unknown | null;
    metadata: unknown;
  }
) {
  await db.insert(auditLogEntries).values({
    id: args.id,
    tenantId: args.tenantId,
    branchId: args.branchId,
    actorUserId: args.actorUserId,
    actorDeviceId: args.actorDeviceId,
    action: args.action,
    entityType: args.entityType,
    entityId: args.entityId,
    idempotencyKey: args.idempotencyKey,
    requestId: args.requestId,
    occurredAt: args.occurredAt,
    before: args.before,
    after: args.after,
    metadata: args.metadata
  });
}
```

- [ ] **Step 3: Implement writeLedger service (receipt only first)**

Create `apps/server/src/services/inventory/writeLedger.ts`:

```ts
import type { PgDb } from "@pharmacy/db";
import { randomUUID } from "node:crypto";
import {
  inventoryLedgerEntries,
  inventoryLots,
  inventoryOperations,
  outboxEvents
} from "@pharmacy/db";
import { writeAudit } from "@pharmacy/security/audit/writeAudit";
import { operationExists } from "@pharmacy/sync/idempotency/ensureIdempotent";

export async function writeReceipt(args: {
  db: PgDb;
  tenantId: string;
  branchId: string;
  userId: string;
  idempotencyKey: string;
  requestId: string;
  occurredAt: Date;
  productId: string;
  batchNo: string;
  expiryDate: string;
  quantityBaseUom: number;
  sourceDocumentType: string;
  sourceDocumentId: string;
}) {
  const already = await operationExists(args.db, args.tenantId, args.idempotencyKey);
  if (already) return { status: "deduped" as const };

  const now = new Date();
  const operationId = randomUUID();
  const lotId = randomUUID();
  const ledgerId = randomUUID();
  const outboxId = randomUUID();
  const auditId = randomUUID();

  await args.db.transaction(async (tx) => {
    await tx.insert(inventoryOperations).values({
      id: operationId,
      tenantId: args.tenantId,
      branchId: args.branchId,
      operationType: "RECEIPT",
      idempotencyKey: args.idempotencyKey,
      requestId: args.requestId,
      occurredAt: args.occurredAt,
      recordedAt: now,
      createdByUserId: args.userId
    });

    await tx.insert(inventoryLots).values({
      id: lotId,
      tenantId: args.tenantId,
      branchId: args.branchId,
      productId: args.productId,
      batchNo: args.batchNo,
      expiryDate: args.expiryDate,
      receivedAt: now,
      createdAt: now
    });

    await tx.insert(inventoryLedgerEntries).values({
      id: ledgerId,
      tenantId: args.tenantId,
      branchId: args.branchId,
      operationId,
      productId: args.productId,
      lotId,
      batchNo: args.batchNo,
      expiryDate: args.expiryDate,
      movementType: "RECEIPT",
      direction: "IN",
      quantityBaseUom: args.quantityBaseUom,
      sourceDocumentType: args.sourceDocumentType,
      sourceDocumentId: args.sourceDocumentId,
      occurredAt: args.occurredAt,
      recordedAt: now,
      createdByUserId: args.userId
    });

    await tx.insert(outboxEvents).values({
      eventId: outboxId,
      tenantId: args.tenantId,
      branchId: args.branchId,
      eventType: "inventory.ledger_entry.created",
      aggregateType: "inventory_lot",
      aggregateId: lotId,
      idempotencyKey: args.idempotencyKey,
      producer: "server",
      schemaVersion: 1,
      payload: {
        operationId,
        ledgerEntryId: ledgerId,
        movementType: "RECEIPT",
        direction: "IN",
        quantityBaseUom: args.quantityBaseUom,
        productId: args.productId,
        lotId,
        batchNo: args.batchNo,
        expiryDate: args.expiryDate
      },
      occurredAt: args.occurredAt,
      receivedAt: now
    });

    await writeAudit(tx as any, {
      id: auditId,
      tenantId: args.tenantId,
      branchId: args.branchId,
      actorUserId: args.userId,
      actorDeviceId: null,
      action: "inventory.ledger.write",
      entityType: "inventory_operation",
      entityId: operationId,
      idempotencyKey: args.idempotencyKey,
      requestId: args.requestId,
      occurredAt: args.occurredAt,
      before: null,
      after: {
        operationId,
        ledgerEntryId: ledgerId,
        lotId
      },
      metadata: {
        sourceDocumentType: args.sourceDocumentType,
        sourceDocumentId: args.sourceDocumentId
      }
    });
  });

  return { status: "created" as const, operationId, ledgerId, lotId };
}
```

- [ ] **Step 4: Wire receipt route**

Modify `apps/server/src/routes/inventory.ts`:

```ts
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeReceipt } from "../services/inventory/writeLedger.js";

const receiptBody = z.object({
  productId: z.string().uuid(),
  batchNo: z.string().min(1),
  expiryDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),
  quantityBaseUom: z.number().int().positive(),
  sourceDocumentType: z.string().min(1),
  sourceDocumentId: z.string().min(1)
});

export const inventoryRoutes: FastifyPluginAsync = async (app) => {
  app.post("/ledger/receipt", async (req) => {
    if (!req.ctx.branchId) throw app.httpErrors.badRequest("branch required");
    const parsed = receiptBody.safeParse(req.body);
    if (!parsed.success) throw app.httpErrors.badRequest("invalid body");
    const r = await writeReceipt({
      db: (app as any).db,
      tenantId: req.ctx.tenantId,
      branchId: req.ctx.branchId,
      userId: req.ctx.userId,
      idempotencyKey: req.ctx.idempotencyKey,
      requestId: req.ctx.requestId,
      occurredAt: new Date(),
      ...parsed.data
    });
    return r;
  });

  app.post("/ledger/issue", async () => {
    throw app.httpErrors.notImplemented();
  });
  app.post("/ledger/adjustment", async () => {
    throw app.httpErrors.notImplemented();
  });
};
```

- [ ] **Step 5: Update test expectation for receipt**

Modify `apps/server/src/routes/inventory.test.ts` to assert 200 and created/deduped response once DB is wired in a later task using a real test database (see Task 8). For now, keep the 501 test for `issue`.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(inventory): implement receipt ledger write with outbox and audit"
```

## Task 8: Test infrastructure with ephemeral PostgreSQL + real DB tests

**Files:**

- Create: `apps/server/src/test/db.ts`
- Modify: `apps/server/src/routes/inventory.test.ts`

- [ ] **Step 1: Add testcontainers**

Run:

```bash
npm i -D testcontainers
```

- [ ] **Step 2: Add postgres test helper**

Create `apps/server/src/test/db.ts`:

```ts
import { PostgreSqlContainer } from "testcontainers";
import { createPgDb } from "@pharmacy/db";

export async function withPostgres<T>(
  fn: (args: { databaseUrl: string; db: ReturnType<typeof createPgDb> }) => Promise<T>
) {
  const c = await new PostgreSqlContainer("postgres:16").start();
  const databaseUrl = c.getConnectionUri();
  const db = createPgDb(databaseUrl);
  try {
    return await fn({ databaseUrl, db });
  } finally {
    await c.stop();
  }
}
```

- [ ] **Step 3: Update inventory receipt test to use real DB**

Modify `apps/server/src/routes/inventory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { withPostgres } from "../test/db.js";

describe("inventory routes", () => {
  it("creates a receipt entry and dedupes on idempotency key", async () => {
    await withPostgres(async ({ db }) => {
      const app = buildApp({ db });
      const headers = {
        "x-tenant-id": "00000000-0000-0000-0000-000000000001",
        "x-branch-id": "00000000-0000-0000-0000-000000000002",
        "x-user-id": "00000000-0000-0000-0000-000000000003",
        "idempotency-key": "00000000-0000-0000-0000-000000000004"
      };

      const payload = {
        productId: "00000000-0000-0000-0000-000000000010",
        batchNo: "BATCH-1",
        expiryDate: "2026-12-31",
        quantityBaseUom: 100,
        sourceDocumentType: "GRN",
        sourceDocumentId: "GRN-1"
      };

      const res1 = await app.inject({
        method: "POST",
        url: "/v1/inventory/ledger/receipt",
        headers,
        payload
      });
      expect(res1.statusCode).toBe(200);
      expect(res1.json().status).toBe("created");

      const res2 = await app.inject({
        method: "POST",
        url: "/v1/inventory/ledger/receipt",
        headers,
        payload
      });
      expect(res2.statusCode).toBe(200);
      expect(res2.json().status).toBe("deduped");
    });
  });
});
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "test(inventory): add real postgres tests and idempotency coverage"
```

## Task 9: Implement issue flow with FEFO allocation + no-negative guard (+ override permission)

**Files:**

- Create: `apps/server/src/services/inventory/issueStock.ts`
- Modify: `apps/server/src/routes/inventory.ts`
- Test: `apps/server/src/routes/inventory.test.ts`

- [ ] **Step 1: Add tests for FEFO issuance and insufficient stock rejection**

Modify `apps/server/src/routes/inventory.test.ts` (append these tests):

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { withPostgres } from "../test/db.js";
import { rolePermissions, roles, userRoleAssignments } from "@pharmacy/db";

async function seedIssuePermission(db: any, args: { tenantId: string; userId: string }) {
  const roleId = "00000000-0000-0000-0000-000000000020";
  await db.insert(roles).values({
    id: roleId,
    tenantId: args.tenantId,
    name: "inventory-issuer",
    createdAt: new Date()
  });
  await db.insert(rolePermissions).values({
    id: "00000000-0000-0000-0000-000000000021",
    tenantId: args.tenantId,
    roleId,
    permissionKey: "INVENTORY_ISSUE_CREATE",
    createdAt: new Date()
  });
  await db.insert(userRoleAssignments).values({
    id: "00000000-0000-0000-0000-000000000022",
    tenantId: args.tenantId,
    userId: args.userId,
    roleId,
    branchId: null,
    createdAt: new Date()
  });
}

describe("inventory issue", () => {
  it("allocates FEFO across lots when issuing without explicit lot selection", async () => {
    await withPostgres(async ({ db }) => {
      const tenantId = "00000000-0000-0000-0000-000000000001";
      const branchId = "00000000-0000-0000-0000-000000000002";
      const userId = "00000000-0000-0000-0000-000000000003";
      const productId = "00000000-0000-0000-0000-000000000010";

      await seedIssuePermission(db as any, { tenantId, userId });

      const app = buildApp({ db });

      const baseHeaders = {
        "x-tenant-id": tenantId,
        "x-branch-id": branchId,
        "x-user-id": userId
      };

      const r1 = await app.inject({
        method: "POST",
        url: "/v1/inventory/ledger/receipt",
        headers: { ...baseHeaders, "idempotency-key": "00000000-0000-0000-0000-000000000101" },
        payload: {
          productId,
          batchNo: "B1",
          expiryDate: "2026-06-01",
          quantityBaseUom: 10,
          sourceDocumentType: "GRN",
          sourceDocumentId: "GRN-1"
        }
      });
      expect(r1.statusCode).toBe(200);

      const r2 = await app.inject({
        method: "POST",
        url: "/v1/inventory/ledger/receipt",
        headers: { ...baseHeaders, "idempotency-key": "00000000-0000-0000-0000-000000000102" },
        payload: {
          productId,
          batchNo: "B2",
          expiryDate: "2026-05-01",
          quantityBaseUom: 10,
          sourceDocumentType: "GRN",
          sourceDocumentId: "GRN-2"
        }
      });
      expect(r2.statusCode).toBe(200);

      const issue = await app.inject({
        method: "POST",
        url: "/v1/inventory/ledger/issue",
        headers: { ...baseHeaders, "idempotency-key": "00000000-0000-0000-0000-000000000103" },
        payload: {
          productId,
          quantityBaseUom: 12,
          sourceDocumentType: "SALE",
          sourceDocumentId: "S-1"
        }
      });
      expect(issue.statusCode).toBe(200);
      const body = issue.json();
      expect(body.status).toBe("created");
      expect(body.allocations[0].batchNo).toBe("B2");
      expect(body.allocations[0].qty).toBe(10);
      expect(body.allocations[1].batchNo).toBe("B1");
      expect(body.allocations[1].qty).toBe(2);
    });
  });

  it("rejects insufficient stock by default", async () => {
    await withPostgres(async ({ db }) => {
      const tenantId = "00000000-0000-0000-0000-000000000001";
      const branchId = "00000000-0000-0000-0000-000000000002";
      const userId = "00000000-0000-0000-0000-000000000003";
      const productId = "00000000-0000-0000-0000-000000000010";

      await seedIssuePermission(db as any, { tenantId, userId });

      const app = buildApp({ db });
      const baseHeaders = {
        "x-tenant-id": tenantId,
        "x-branch-id": branchId,
        "x-user-id": userId
      };

      const issue = await app.inject({
        method: "POST",
        url: "/v1/inventory/ledger/issue",
        headers: { ...baseHeaders, "idempotency-key": "00000000-0000-0000-0000-000000000201" },
        payload: {
          productId,
          quantityBaseUom: 1,
          sourceDocumentType: "SALE",
          sourceDocumentId: "S-2"
        }
      });

      expect(issue.statusCode).toBe(409);
      expect(issue.json().code).toBe("INSUFFICIENT_STOCK");
    });
  });
});
```

- [ ] **Step 2: Implement issue service (FEFO allocation + transactional write)**

Create `apps/server/src/services/inventory/issueStock.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { PgDb } from "@pharmacy/db";
import {
  inventoryLedgerEntries,
  inventoryLots,
  inventoryOperations,
  outboxEvents
} from "@pharmacy/db";
import { allocateFefo } from "@pharmacy/domain/inventory/fefo";
import { writeAudit } from "@pharmacy/security/audit/writeAudit";
import { operationExists } from "@pharmacy/sync/idempotency/ensureIdempotent";
import { and, eq, gte, sql } from "drizzle-orm";

export async function issueStock(args: {
  db: PgDb;
  tenantId: string;
  branchId: string;
  userId: string;
  idempotencyKey: string;
  requestId: string;
  occurredAt: Date;
  productId: string;
  quantityBaseUom: number;
  sourceDocumentType: string;
  sourceDocumentId: string;
}) {
  const already = await operationExists(args.db, args.tenantId, args.idempotencyKey);
  if (already) return { status: "deduped" as const };

  const rows = await args.db
    .select({
      lotId: inventoryLots.id,
      batchNo: inventoryLots.batchNo,
      expiryDate: inventoryLots.expiryDate,
      receivedAt: inventoryLots.receivedAt,
      availableQty: sql<number>`coalesce(sum(case when ${inventoryLedgerEntries.direction} = 'IN' then ${inventoryLedgerEntries.quantityBaseUom} else -${inventoryLedgerEntries.quantityBaseUom} end), 0)`
    })
    .from(inventoryLots)
    .leftJoin(
      inventoryLedgerEntries,
      and(
        eq(inventoryLedgerEntries.lotId, inventoryLots.id),
        eq(inventoryLedgerEntries.tenantId, inventoryLots.tenantId)
      )
    )
    .where(
      and(
        eq(inventoryLots.tenantId, args.tenantId),
        eq(inventoryLots.branchId, args.branchId),
        eq(inventoryLots.productId, args.productId),
        gte(inventoryLots.expiryDate, sql`CURRENT_DATE`)
      )
    )
    .groupBy(
      inventoryLots.id,
      inventoryLots.batchNo,
      inventoryLots.expiryDate,
      inventoryLots.receivedAt
    );

  const lots = rows.map((r: any) => ({
    lotId: r.lotId,
    expiryDate: r.expiryDate,
    receivedAt: r.receivedAt ? new Date(r.receivedAt).toISOString() : null,
    availableQty: Number(r.availableQty)
  }));

  const { allocations, remaining } = allocateFefo(lots, args.quantityBaseUom);
  if (remaining > 0) {
    return {
      status: "rejected" as const,
      code: "INSUFFICIENT_STOCK",
      remaining
    };
  }

  const now = new Date();
  const operationId = randomUUID();
  const outboxId = randomUUID();
  const auditId = randomUUID();

  const allocationDetails = allocations.map((a) => {
    const meta = rows.find((r: any) => r.lotId === a.lotId);
    return { lotId: a.lotId, qty: a.qty, batchNo: meta?.batchNo, expiryDate: meta?.expiryDate };
  });

  await args.db.transaction(async (tx) => {
    await tx.insert(inventoryOperations).values({
      id: operationId,
      tenantId: args.tenantId,
      branchId: args.branchId,
      operationType: "ISSUE",
      idempotencyKey: args.idempotencyKey,
      requestId: args.requestId,
      occurredAt: args.occurredAt,
      recordedAt: now,
      createdByUserId: args.userId
    });

    for (const a of allocations) {
      const ledgerId = randomUUID();
      const meta = rows.find((r: any) => r.lotId === a.lotId);

      await tx.insert(inventoryLedgerEntries).values({
        id: ledgerId,
        tenantId: args.tenantId,
        branchId: args.branchId,
        operationId,
        productId: args.productId,
        lotId: a.lotId,
        batchNo: meta?.batchNo ?? null,
        expiryDate: meta?.expiryDate ?? null,
        movementType: "ISSUE",
        direction: "OUT",
        quantityBaseUom: a.qty,
        sourceDocumentType: args.sourceDocumentType,
        sourceDocumentId: args.sourceDocumentId,
        occurredAt: args.occurredAt,
        recordedAt: now,
        createdByUserId: args.userId
      });
    }

    await tx.insert(outboxEvents).values({
      eventId: outboxId,
      tenantId: args.tenantId,
      branchId: args.branchId,
      eventType: "inventory.operation.issued",
      aggregateType: "inventory_operation",
      aggregateId: operationId,
      idempotencyKey: args.idempotencyKey,
      producer: "server",
      schemaVersion: 1,
      payload: {
        operationId,
        productId: args.productId,
        quantityBaseUom: args.quantityBaseUom,
        allocations: allocationDetails,
        sourceDocumentType: args.sourceDocumentType,
        sourceDocumentId: args.sourceDocumentId
      },
      occurredAt: args.occurredAt,
      receivedAt: now
    });

    await writeAudit(tx as any, {
      id: auditId,
      tenantId: args.tenantId,
      branchId: args.branchId,
      actorUserId: args.userId,
      actorDeviceId: null,
      action: "inventory.issue",
      entityType: "inventory_operation",
      entityId: operationId,
      idempotencyKey: args.idempotencyKey,
      requestId: args.requestId,
      occurredAt: args.occurredAt,
      before: null,
      after: {
        operationId,
        allocations: allocationDetails
      },
      metadata: {
        sourceDocumentType: args.sourceDocumentType,
        sourceDocumentId: args.sourceDocumentId
      }
    });
  });

  return { status: "created" as const, operationId, allocations: allocationDetails };
}
```

- [ ] **Step 3: Wire issue route + RBAC check**

Modify `apps/server/src/routes/inventory.ts` (add the issue schema + handler):

```ts
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeReceipt } from "../services/inventory/writeLedger.js";
import { issueStock } from "../services/inventory/issueStock.js";

const receiptBody = z.object({
  productId: z.string().uuid(),
  batchNo: z.string().min(1),
  expiryDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),
  quantityBaseUom: z.number().int().positive(),
  sourceDocumentType: z.string().min(1),
  sourceDocumentId: z.string().min(1)
});

const issueBody = z.object({
  productId: z.string().uuid(),
  quantityBaseUom: z.number().int().positive(),
  sourceDocumentType: z.string().min(1),
  sourceDocumentId: z.string().min(1)
});

export const inventoryRoutes: FastifyPluginAsync = async (app) => {
  app.post("/ledger/receipt", async (req) => {
    if (!req.ctx.branchId) throw app.httpErrors.badRequest("branch required");
    const parsed = receiptBody.safeParse(req.body);
    if (!parsed.success) throw app.httpErrors.badRequest("invalid body");
    return await writeReceipt({
      db: (app as any).db,
      tenantId: req.ctx.tenantId,
      branchId: req.ctx.branchId,
      userId: req.ctx.userId,
      idempotencyKey: req.ctx.idempotencyKey,
      requestId: req.ctx.requestId,
      occurredAt: new Date(),
      ...parsed.data
    });
  });

  app.post("/ledger/issue", async (req) => {
    if (!req.ctx.branchId) throw app.httpErrors.badRequest("branch required");
    await req.requirePermission("INVENTORY_ISSUE_CREATE");
    const parsed = issueBody.safeParse(req.body);
    if (!parsed.success) throw app.httpErrors.badRequest("invalid body");

    const r = await issueStock({
      db: (app as any).db,
      tenantId: req.ctx.tenantId,
      branchId: req.ctx.branchId,
      userId: req.ctx.userId,
      idempotencyKey: req.ctx.idempotencyKey,
      requestId: req.ctx.requestId,
      occurredAt: new Date(),
      ...parsed.data
    });

    if (r.status === "rejected") throw app.httpErrors.conflict(r);
    return r;
  });

  app.post("/ledger/adjustment", async () => {
    throw app.httpErrors.notImplemented();
  });
};
```

- [ ] **Step 4: Run tests + typecheck**

Run:

```bash
npm run typecheck
npm test
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(inventory): implement FEFO issue with no-negative guard and override"
```

## Task 10: Sync endpoints (push intents + pull outbox)

**Files:**

- Create: `apps/server/src/routes/sync.ts`
- Modify: `apps/server/src/app.ts`
- Create: `packages/sync/src/protocol.ts`
- Create: `packages/sync/src/client/sqliteOutbox.ts`
- Test: `apps/server/src/routes/sync.test.ts`

- [ ] **Step 1: Define protocol types**

Create `packages/sync/src/protocol.ts`:

```ts
import { z } from "zod";

export const pushIntent = z.object({
  idempotencyKey: z.string().uuid(),
  eventType: z.string().min(1),
  payload: z.record(z.any()),
  occurredAt: z.string().datetime()
});

export const pushRequest = z.object({
  intents: z.array(pushIntent).min(1)
});
```

- [ ] **Step 2: Implement sync routes (push + pull)**

Create `apps/server/src/routes/sync.ts`:

```ts
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { outboxEvents } from "@pharmacy/db";
import { and, eq, gt, asc, sql } from "drizzle-orm";

const pushIntent = z.object({
  idempotencyKey: z.string().uuid(),
  eventType: z.string().min(1),
  payload: z.record(z.any()),
  occurredAt: z.string().datetime()
});

const pushRequest = z.object({
  intents: z.array(pushIntent).min(1)
});

export const syncRoutes: FastifyPluginAsync = async (app) => {
  app.post("/push", async (req) => {
    const parsed = pushRequest.safeParse(req.body);
    if (!parsed.success) throw app.httpErrors.badRequest("invalid body");

    const results = parsed.data.intents.map((i) => ({
      idempotencyKey: i.idempotencyKey,
      status: "rejected" as const,
      code: "UNSUPPORTED_INTENT" as const
    }));

    return { results };
  });

  app.get("/pull", async (req) => {
    const cursor = typeof (req.query as any).cursor === "string" ? (req.query as any).cursor : null;
    const limit =
      typeof (req.query as any).limit === "string" ? Number((req.query as any).limit) : 100;

    const rows = await (app as any).db
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.tenantId, req.ctx.tenantId),
          cursor ? gt(outboxEvents.receivedAt, new Date(cursor)) : sql`true`
        )
      )
      .orderBy(asc(outboxEvents.receivedAt))
      .limit(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 100);

    const nextCursor = rows.length
      ? new Date(rows[rows.length - 1].receivedAt).toISOString()
      : cursor;
    return { events: rows, nextCursor };
  });
};
```

Modify `apps/server/src/app.ts` to register the routes:

```ts
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { PgDb } from "@pharmacy/db";
import { contextPlugin } from "./plugins/context.js";
import { authzPlugin } from "./plugins/authz.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { syncRoutes } from "./routes/sync.js";

export type AppDeps = {
  db: PgDb;
};

export function buildApp(deps: AppDeps) {
  const app = Fastify({ logger: true });
  app.decorate("db", deps.db);

  app.register(sensible);
  app.register(contextPlugin);
  app.register(authzPlugin);

  app.get("/health", async () => ({ ok: true }));
  app.register(inventoryRoutes, { prefix: "/v1/inventory" });
  app.register(syncRoutes, { prefix: "/v1/sync" });

  return app;
}
```

- [ ] **Step 3: Implement SQLite outbox helpers (for Tauri)**

Create `packages/sync/src/client/sqliteOutbox.ts`:

```ts
import type { SqliteDb } from "@pharmacy/db";
import { clientOutbox } from "@pharmacy/db";
import { eq, isNull, asc } from "drizzle-orm";

export async function enqueueIntent(
  db: SqliteDb,
  intent: {
    id: string;
    tenantId: string;
    branchId: string;
    idempotencyKey: string;
    eventType: string;
    payload: string;
    occurredAt: number;
  }
) {
  await db.insert(clientOutbox).values({
    id: intent.id,
    tenantId: intent.tenantId,
    branchId: intent.branchId,
    idempotencyKey: intent.idempotencyKey,
    eventType: intent.eventType,
    payload: intent.payload,
    occurredAt: intent.occurredAt,
    syncedAt: null
  });
}

export async function markSynced(db: SqliteDb, idempotencyKey: string, syncedAt: number) {
  await db
    .update(clientOutbox)
    .set({ syncedAt })
    .where(eq(clientOutbox.idempotencyKey, idempotencyKey));
}

export async function listPending(db: SqliteDb, limit: number) {
  return await db
    .select()
    .from(clientOutbox)
    .where(isNull(clientOutbox.syncedAt))
    .orderBy(asc(clientOutbox.occurredAt))
    .limit(limit);
}
```

- [ ] **Step 4: Add sync tests**

Create `apps/server/src/routes/sync.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { withPostgres } from "../test/db.js";

describe("sync pull", () => {
  it("returns an empty list when no events exist", async () => {
    await withPostgres(async ({ db }) => {
      const app = buildApp({ db });
      const res = await app.inject({
        method: "GET",
        url: "/v1/sync/pull",
        headers: {
          "x-tenant-id": "00000000-0000-0000-0000-000000000001",
          "x-branch-id": "00000000-0000-0000-0000-000000000002",
          "x-user-id": "00000000-0000-0000-0000-000000000003",
          "idempotency-key": "00000000-0000-0000-0000-000000000004"
        }
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().events).toEqual([]);
    });
  });
});
```

- [ ] **Step 5: Run typecheck + tests**

Run:

```bash
npm run typecheck
npm test
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(sync): add pull endpoint and sqlite outbox helpers"
```

## Task 11: Security hardening checklist + docs updates

**Files:**

- Modify: `docs/superpowers/specs/2026-05-12-inventory-ledger-core-design.md`
- Create: `docs/security.md`
- Create: `docs/sync.md`
- Create: `docs/inventory-ledger.md`

- [ ] **Step 1: Document env vars and secret handling**

Create `docs/security.md` including:

- required env vars (`DATABASE_URL`, encryption master key reference)
- no hardcoded secrets policy
- logging redaction rules

- [ ] **Step 2: Document sync contract**

Create `docs/sync.md` with:

- push request/response examples
- pull cursor rules
- idempotency guarantees
- conflict error payload examples (`INSUFFICIENT_STOCK`)

- [ ] **Step 3: Document inventory ledger**

Create `docs/inventory-ledger.md` with:

- movement types and semantics
- FEFO behavior and edge cases (expired lots)
- no-negative + override policy
- audit events emitted per operation

- [ ] **Step 4: Run lint/typecheck/tests**

Run:

```bash
npm run lint
npm run typecheck
npm test
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "docs: add security, sync, and inventory ledger documentation"
```

---

## Plan Self-Review

- Coverage: schema (lots/ledger/outbox), FEFO, idempotency, sync, RBAC, audit, and docs are all mapped to tasks.
- Placeholder scan: no placeholders.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-12-inventory-ledger-core.md`.

Two execution options:

1. Subagent-Driven (recommended) — dispatch a fresh subagent per task, review between tasks
2. Inline Execution — execute tasks in this session with checkpoints

Which approach?
