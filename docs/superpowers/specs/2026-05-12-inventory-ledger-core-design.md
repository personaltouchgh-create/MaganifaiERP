# Inventory Ledger Core (Multi-tenant, Batch/Expiry-aware, Offline Sync)

Date: 2026-05-12

## Purpose

Define the foundational inventory subsystem for a multi-tenant pharmacy ERP for Ghana/West Africa:

- Batch/expiry-aware stock tracking
- Ledger/event-driven, append-only source of truth
- Multi-branch per tenant
- Offline-first clients (SQLite) syncing to server (PostgreSQL) via outbox events
- Strict RBAC + immutable audit logs
- No hardcoded secrets; encryption for sensitive personal/health data (platform rule)

This spec is deliberately scoped to the inventory ledger core and the platform primitives it depends on (tenant/branch scoping, outbox/idempotency, RBAC/audit). Other modules (ordering, dispensing workflows, accounting) will consume these primitives later.

## Non-negotiables (Restated)

- Inventory is batch/expiry-aware and ledger/event-driven.
- Multi-branch per tenant.
- Strict RBAC + audit logs.
- No hardcoded secrets.
- Encryption for sensitive personal/health data.
- Event/outbox sync with idempotency keys for offline replay.

## Approach Options Considered

### Option A: Full event sourcing

Persist only domain events and build inventory projections from events.

- Pros: best auditability; flexible projections.
- Cons: complexity for reporting, reconciliation, and offline; higher operational cost early.

### Option B: Ledger-only (no domain events)

Persist only append-only ledger entries; derive SOH by summation.

- Pros: simplest accurate stock math; easy reporting.
- Cons: less expressive cross-domain workflow/event needs; integrations become harder.

### Option C: Hybrid (Chosen)

Append-only inventory ledger as the accounting/stock source of truth, plus append-only outbox events for sync/integrations.

- Pros: deterministic stock math + audit; clean offline sync and integration boundaries.
- Cons: introduces both ledger + outbox tables (manageable).

## Domain Concepts

### Tenant and Branch

- `tenant_id` scopes all tenant-owned data.
- `branch_id` scopes stock and operational actions.

Rule: all stock-affecting records include both `tenant_id` and `branch_id`.

### Product and UoM

- Inventory movements are recorded in **base units** (integer).
- Conversion to display packs is done in read models/UI.

### Lot (Batch/Expiry)

A lot is identified by:

- `tenant_id`
- `branch_id`
- `product_id`
- `batch_no`
- `expiry_date`

Optional additional attributes: `received_at`, `supplier_id`, `unit_cost`, `pack_size`, `manufacturer`, `notes`.

### FEFO Allocation

Default issuance policy: **FEFO** (first-expiry-first-out).

When a decrease does not specify an explicit batch, the system:

- Filters eligible lots (not expired, positive available)
- Sorts by `expiry_date ASC, received_at ASC`
- Allocates across lots until quantity is satisfied

## Server Data Model (PostgreSQL)

This section describes the logical schema. Physical naming can be adapted to match repository conventions.

### Core tables

#### tenants

- `id` (uuid pk)
- `name`
- `created_at`

#### branches

- `id` (uuid pk)
- `tenant_id` (uuid fk)
- `name`
- `created_at`

#### products

- `id` (uuid pk)
- `tenant_id` (uuid fk)
- `sku` (unique per tenant)
- `name`
- `is_lot_tracked` (bool)
- `base_uom` (text)
- `created_at`

#### inventory_lots

Represents the lot identity and metadata (not mutable SOH).

- `id` (uuid pk)
- `tenant_id` (uuid fk)
- `branch_id` (uuid fk)
- `product_id` (uuid fk)
- `batch_no` (text)
- `expiry_date` (date)
- `received_at` (timestamptz nullable)
- `supplier_id` (uuid nullable)
- `unit_cost_minor` (int nullable)
- `currency` (text nullable)
- `created_at`

Uniqueness:

- `(tenant_id, branch_id, product_id, batch_no, expiry_date)` unique

#### inventory_operations

Represents a single idempotent inventory operation (e.g. one receipt, one issue, one adjustment). An operation can create multiple ledger rows (e.g. an issue allocated across multiple lots).

- `id` (uuid pk)
- `tenant_id` (uuid fk)
- `branch_id` (uuid fk)
- `operation_type` (text enum: `RECEIPT` | `ISSUE` | `ADJUSTMENT` | `TRANSFER`)
- `idempotency_key` (uuid)
- `request_id` (uuid)
- `occurred_at` (timestamptz)
- `recorded_at` (timestamptz)
- `created_by_user_id` (uuid)
- `created_by_device_id` (uuid nullable)

Uniqueness:

- `(tenant_id, idempotency_key)` unique

#### inventory_ledger_entries

Append-only stock movements. This is the stock source of truth.

- `id` (uuid pk)
- `tenant_id` (uuid fk)
- `branch_id` (uuid fk)
- `operation_id` (uuid fk → `inventory_operations.id`)
- `product_id` (uuid fk)
- `lot_id` (uuid fk nullable; required when `products.is_lot_tracked = true`)
- `batch_no` (text nullable; denormalized for query)
- `expiry_date` (date nullable; denormalized for query)
- `movement_type` (text enum)
- `direction` (text enum: `IN` | `OUT`)
- `quantity_base_uom` (int, positive)
- `source_document_type` (text)
- `source_document_id` (uuid or text; depends on document strategy)
- `source_line_id` (uuid nullable)
- `occurred_at` (timestamptz)
- `recorded_at` (timestamptz)
- `created_by_user_id` (uuid)
- `created_by_device_id` (uuid nullable)

Constraints:

- `quantity_base_uom > 0`
- If `direction = OUT` then enforce available stock policy (see invariants).

Recommended movement types:

- `RECEIPT`
- `ISSUE`
- `TRANSFER_OUT`
- `TRANSFER_IN`
- `ADJUSTMENT`
- `RETURN_IN`
- `WRITE_OFF`

### Read models (optional but recommended)

The core ledger design avoids mutable SOH fields, but production systems typically need fast reads. Two common read models:

- `inventory_lot_balances` (materialized per lot)
- `inventory_product_balances` (materialized per product, per branch)

These can be maintained:

- synchronously on write (within the same transaction), or
- asynchronously as projections from outbox events (with eventual consistency)

For early implementation, synchronous updates are acceptable if done transactionally and tested.

## Invariants and Business Rules

### No-negative stock (default)

Default policy: do not allow stock to go negative.

On any OUT movement:

- Compute available stock for target lot(s) under the same `tenant_id` and `branch_id`
- Reject if insufficient

### Override behavior

Add a permission `INVENTORY_NEGATIVE_OVERRIDE`.

If granted:

- Allow forced OUT movement
- Require a structured `override_reason` recorded in audit metadata

### Expiry guard

By default, do not allocate from expired lots.
An explicit permission may allow expiry override for specific workflows, but must be audited.

## Outbox + Sync + Idempotency

### Goals

- Clients can operate offline and later sync deterministically.
- Retries and replays do not duplicate effects.
- Server can safely de-duplicate by idempotency key per tenant.

### outbox_events (server)

Append-only event log representing committed facts that other systems and clients can consume.

- `event_id` (uuid pk)
- `tenant_id`
- `branch_id`
- `event_type` (e.g. `inventory.ledger_entry.created`)
- `aggregate_type`
- `aggregate_id`
- `idempotency_key` (uuid)
- `producer` (text; `server` or `client:<device_id>`)
- `schema_version` (int)
- `payload` (jsonb)
- `occurred_at` (timestamptz)
- `received_at` (timestamptz)

Uniqueness:

- `(tenant_id, idempotency_key)` unique

### Client SQLite outbox (offline)

Clients maintain a local outbox or intent log:

- Unsynced intents are queued with `idempotency_key`
- On sync, the client pushes a batch; server responds with per-item status

### Sync flow (high level)

#### Client → Server (push)

1. Client sends unsynced intents (e.g. ledger write requests) with `idempotency_key`, `occurred_at`, `branch_id`, and actor context.
2. Server validates:
   - tenant/branch scoping
   - RBAC permission
   - invariants (no-negative, expiry constraints, FEFO allocation rules)
3. Server transactionally writes:
   - `inventory_ledger_entries` rows
   - `outbox_events` row(s)
   - `audit_log_entries` row(s)
4. If the same `idempotency_key` is re-submitted, server returns the canonical outcome without duplicating.

#### Server → Client (pull)

Clients fetch outbox events using a cursor:

- `received_at` watermark, or
- monotonic `event_id`/sequence per tenant

Client applies events idempotently to local read models.

### Conflict handling

Because decreases are allowed offline, the server may reject some pushed OUT intents if stock is insufficient at sync time.

Policy:

- Reject the specific OUT intent with a structured error:
  - `code: INSUFFICIENT_STOCK`
  - current server SOH by lot/product
  - suggested FEFO allocation if applicable
- Client requires resolution: re-allocate to available lots, reduce quantity, or use override permission (audited).

## RBAC Model

Chosen: role baseline plus per-user allow/deny grants.

### permissions

Global catalog, examples:

- `INVENTORY_RECEIPT_CREATE`
- `INVENTORY_ISSUE_CREATE`
- `INVENTORY_TRANSFER_CREATE`
- `INVENTORY_ADJUSTMENT_CREATE`
- `INVENTORY_NEGATIVE_OVERRIDE`
- `AUDIT_READ`

### roles

Tenant-scoped roles with role→permission mapping.

### user_role_assignments

Assign a role to a user at:

- tenant scope (`branch_id = null`), or
- branch scope (`branch_id = <branch>`)

### user_permission_grants

Per-user overrides:

- `effect = DENY` or `ALLOW`
- branch-scoped or tenant-scoped

Resolution order:

1. Role-derived allows
2. User-specific denies
3. User-specific allows
   Default deny.

## Audit Logging

### audit_log_entries

Append-only audit events for every mutating operation.

Fields (logical):

- `id` (uuid pk)
- `tenant_id`
- `branch_id` nullable
- `actor_user_id`
- `actor_device_id` nullable
- `action` (e.g. `inventory.ledger.write`)
- `entity_type`, `entity_id`
- `idempotency_key`, `request_id`
- `occurred_at`
- `before` json nullable
- `after` json nullable
- `metadata` json (override reason, FEFO allocation details, source doc refs)

Rule: every ledger write must insert an audit row in the same DB transaction.

## Secrets and Encryption

### Secrets

- No secrets are hardcoded in the repository.
- All secrets come from environment variables or an external secret manager.
- Never log secrets; never emit secrets to client devices.

### Encryption for sensitive data (platform rule)

Inventory is typically non-PHI, but the platform must support PHI/PII safely.

Requirement:

- Encrypt sensitive personal/health data at rest using envelope encryption:
  - master key managed by KMS
  - per-tenant data encryption key (DEK), versioned
  - ciphertext stored with `key_version` and `algorithm`
- Strict logging hygiene: never log plaintext PHI/PII.

## API Surface (Conceptual)

Implementation will define exact paths; these are the core operations.

- `POST /v1/inventory/ledger/receipt`
- `POST /v1/inventory/ledger/issue` (supports FEFO allocation if batch not specified)
- `POST /v1/inventory/ledger/adjustment`
- `POST /v1/sync/push` (batch of intents with idempotency keys)
- `GET  /v1/sync/pull?cursor=...` (outbox events)

All endpoints require:

- tenant context
- branch context when stock-affecting
- authenticated user context
- idempotency key for mutating calls

## Testing Strategy (To Be Implemented)

Minimum tests for the first implementation slice:

- Ledger append behavior and idempotency dedupe.
- FEFO allocation correctness across lots with varying expiry and received_at.
- No-negative stock guard and override permission behavior.
- Sync push conflict handling (`INSUFFICIENT_STOCK`).
- RBAC enforcement for each movement type.
- Audit log creation in the same transaction as ledger writes.

## Security Hardening Steps (To Be Implemented)

- Parameterized queries/ORM only; no string concatenation SQL.
- Database constraints for tenant isolation and uniqueness.
- Centralized authorization check helpers; default deny.
- Structured logging with redaction; ensure PHI/PII never logged.
- Key management documented; no secrets committed; dotenv only for local dev templates.

## Out of Scope (This Spec)

- Patient records, prescriptions, interactions, clinical governance.
- Payments, invoices, reconciliation.
- Full UI flows and desktop workflows.
- NHIS and external integrations beyond outbox primitives.
