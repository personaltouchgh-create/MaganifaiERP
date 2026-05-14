# Payments + Offline Sync (Paystack) — Design

## Context

This repository currently contains application scaffolding (API/worker/frontends) but does not yet implement invoices, payments, Paystack integration, offline sync rules, or reconciliation. This design is derived from the “Low‑Fi Wireframes + Offline Sync Rules” document.

This design must also satisfy platform non-negotiables:

- Multi-tenant and multi-branch per tenant (tenant_id everywhere; branch scoping).
- Offline-first for ERP desktop and staff mobile using SQLite outbox events + idempotency.
- Strict RBAC + audit logs for all sensitive actions.
- Field-level AES-256-GCM envelope encryption + key versioning for sensitive data.
- No hardcoded secrets; configuration only via env vars / secret manager.

## Goals

- Implement invoice payments with **partial payments** and **Paystack** (MoMo + Card) per tenant.
- Provide **Portal (PWA)** “Bills & Payments” experiences: bills list, pay-now, pending/verify.
- Provide **ERP** payment operations: tenant payment settings, invoice payment history, refunds, status refresh.
- Provide **daily reconciliation** (Paystack vs ERP allocations) and mismatch “Fix” workflow.
- Enforce offline rules: Pay-now is **online-only**; COD settlement can be queued offline but only closes on sync; never manually mark Paystack success offline.

## Non-Goals (v0)

- Full double-entry accounting ledger.
- Automatic reconciliation auto-fixing without provider verification.
- Cross-tenant shared Paystack account (this is explicitly per-tenant).

## Key Decisions

- Paystack integration is **per tenant**.
- Tenant admin enters Paystack keys and webhook secret in ERP settings; stored encrypted in DB using envelope encryption + key versioning; never returned back in full after save.
- Webhook endpoint is **per tenant**: `/payments/webhooks/paystack/{tenantId}`.
- **Single pending PaymentIntent per invoice** (to reduce duplicates).
- Webhooks are authoritative; verify is a safe “pull-to-refresh” that is idempotent.
- Invoices are branch-scoped; payments inherit branch from the invoice.

## Domain Model

### TenantPaymentSettings

- `tenantId`
- `keyVersion: number`
- `paystackEnabled: boolean`
- `channels: { momo: boolean; card: boolean }`
- `minPartialAmountGhs: number`
- `paystackPublicKey: string`
- `paystackSecretKeyEncrypted: bytes`
- `paystackWebhookSecretEncrypted: bytes`
- `webhookLastSeenAt: datetime | null`
- `webhookLastStatus: OK | FAIL | null`

### CustomerLink (Portal)

- `tenantId`
- `branchId` (optional; if a customer is linked to a specific branch)
- `portalUserId`
- `customerId` (tenant-scoped ERP/customer id)
- Status/verification fields as needed to represent “Not linked” vs linked.

### Invoice

- `tenantId`
- `branchId`
- `invoiceNumber`
- `totalAmount`
- `currency` (GHS)
- `status` (e.g., OPEN, PAID, VOID)
- `paidAmount` (optional denormalized)
- `balanceDue` (optional denormalized)
- Invoice lines are out of scope for payment design detail but required for real invoices.

### PaymentIntent (App-level intent)

Represents the business intent to pay an invoice (partial supported).

- `tenantId`
- `branchId` (must match invoice.branchId; stored for query/indexing)
- `invoiceId`
- `amount`
- `channel: MOMO | CARD`
- `status: PENDING | SUCCEEDED | FAILED`
- `idempotencyKey`
- `createdFrom: PORTAL | ERP`
- `createdByUserId`
- `createdAt`, `updatedAt`

Constraints:

- `amount >= minPartialAmountGhs` and `amount <= invoice.balanceDue`.
- Enforce “single pending intent per invoice” (unique index on `(tenantId, invoiceId, status=PENDING)` or equivalent).

### PaymentTransaction (Provider-truth)

Stores provider identifiers, raw payloads, and provider status.

- `tenantId`
- `branchId` (must match invoice.branchId)
- `paymentIntentId`
- `provider: PAYSTACK`
- `providerRef` (e.g., Paystack reference)
- `providerStatus` (raw and normalized)
- `paidAt`
- `rawPayloadJson`

### PaymentAllocation

Applies confirmed money to an invoice (supports partial payments).

- `tenantId`
- `branchId` (must match invoice.branchId)
- `invoiceId`
- `paymentTransactionId`
- `amount`
- `createdAt`

### Refund

- `tenantId`
- `branchId` (must match invoice.branchId)
- `paymentTransactionId`
- `amount`
- `reason`
- `status: PENDING | SUCCEEDED | FAILED`
- `providerRef`
- `requestedByUserId`
- `approvedByUserId` (or approval object)

### Reconciliation

- `ReconciliationRun`: `tenantId`, `date`, summary counts, generatedAt
- `ReconciliationMismatch`: `tenantId`, `branchId?`, `runId`, `providerRef`, amount, providerStatus, erpStatus, reason, state, resolution metadata

### Offline Outbox (COD)

For COD settlement events queued offline (not Paystack).

- `OfflineOutboxEvent`: `tenantId`, `deviceId`, `eventType`, `payload`, `status`, `createdAt`, `syncedAt`

## Security & Compliance

- Never log secrets or full webhook payloads without redaction.
- Encrypt Paystack secret + webhook secret at rest using AES-256-GCM envelope encryption with tenant-scoped keys and key versioning.
- Do not return stored secrets back to clients; only allow replace.
- No hardcoded secrets; encryption master keys and provider configuration come from env vars / secret manager.
- Add audit logs for:
  - Payment settings edits
  - Refund attempts/approvals
  - Reconciliation “Fix” actions
  - Any privileged “force verify/refresh” actions in ERP (if restricted)

## API Design (High-Level)

### Portal (PWA)

- `GET /portal/bills`
  - Returns outstanding invoices + paid history; pay-now enabled only when online and tenant has Paystack enabled.
- `POST /payments/intents`
  - Body: invoiceId, amount, channel, idempotencyKey
  - Validates min partial + balance cap + single pending rule
  - Creates PaymentIntent and a Paystack transaction initialization; returns `authorization_url`.
- `POST /payments/:intentId/verify`
  - Idempotent; verifies with Paystack; updates intent/transaction/allocation if confirmed.

### Provider Webhook

- `POST /payments/webhooks/paystack/{tenantId}`
  - Verifies signature with tenant’s webhook secret
  - Updates PaymentIntent/Transaction/Allocations based on event type (success/failure/refund events)

### ERP

- `GET /tenants/:tenantId/payment-settings`
- `PUT /tenants/:tenantId/payment-settings`
  - Supports “replace secrets” semantics
- `GET /invoices/:invoiceId/payments`
  - Payment history rows + invoice totals/balance
- `POST /payments/:paymentId/refunds`
  - RBAC + manager approval + reason required
- `POST /payments/:intentId/verify`
  - Same as portal verify; useful for “Refresh status”

### Reconciliation

- `GET /reconciliation/paystack?date=YYYY-MM-DD`
  - Returns report + mismatches
- `POST /reconciliation/mismatches/:id/fix`
  - Attempts verify/fetch provider transaction; creates missing transaction/allocation if legitimate; closes mismatch

## UI Mapping to Wireframes

### Portal (PWA)

- PWA-100 Bills list
  - Outstanding invoices list with “Pay now” disabled when offline
  - Paid history with “View receipt”
- PWA-110 Invoice payment
  - Amount input with min/cap validation
  - Method selection (MoMo/Card)
  - Continue redirects to Paystack authorization_url
- PWA-120 Pending/Verify
  - Show intent status (pending)
  - “I have paid - verify” triggers server verify

### ERP Desktop

- ERP-PAY-001 Tenant Payment Settings
  - Toggle + channels + min partial + keys + webhook status + save with audit
- ERP-PAY-010 Invoice Payments tab
  - Table of intents/transactions with provider refs
  - Refund action (approval + reason)
  - Refresh status (verify pending)
  - No manual “mark paid”
- ERP-PAY-020 Reconciliation report
  - Summary counts + mismatch table
  - Fix action launches mismatch resolution workflow
  - Export CSV

## Offline Rules

- Portal pay-now is **online-only**.
  - Offline mode may show cached bills and allow saving drafts, but pay-now/checkout is disabled.
- Payment verification is **server-only**.
  - Webhook and verify endpoints are idempotent and authoritative.
- Provider outage:
  - Keep PaymentIntent in `PENDING`; retry later; do not flip to `FAILED` unless provider confirms.
- COD settlement:
  - COD settlement events may be queued offline (outbox) and synced later.
  - Closing/reconciliation/books require sync.
- Never allow an operator to manually mark a Paystack payment successful while offline.

## Offline-First Architecture Notes (ERP Desktop + Staff Mobile)

- ERP desktop and staff mobile are offline-first clients backed by SQLite.
- Client writes mutations into a local outbox with a stable idempotency key.
- Server endpoints that accept outbox mutations must be idempotent by `(tenantId, deviceId, idempotencyKey)` and safe to retry.
- Paystack pay-now requires online access; offline outbox is used for COD settlement and other operational events, not for provider payments.

## Reconciliation Job

- Runs daily per tenant.
- Inputs:
  - Provider successful transactions for the date range
  - ERP PaymentTransactions + Allocations for the same range
- Outputs:
  - ReconciliationRun summary
  - Mismatches that require human resolution (“Fix”)
- No auto-fix without provider verification.

## Testing Strategy (v0)

- Unit tests:
  - Amount validation (min partial, cap at balance)
  - Idempotency behavior (intent creation and verify)
  - Single pending intent constraint
  - Webhook signature verification failure paths
- Integration tests (API):
  - Create intent → verify happy path (mock Paystack)
  - Webhook-driven status updates (mock signature + payload)
  - Refund initiation and status progression
- Worker tests:
  - Reconciliation mismatch generation from controlled provider/ERP fixtures

All implemented slices must pass lint, typecheck, and tests.

## Rollout Plan (Implementation Slices)

- Slice 1: Prisma schema + basic invoice/payment tables + API skeleton endpoints
- Slice 2: Portal PWA bills/pay-now/pending + Paystack initialize + verify
- Slice 3: Webhook handling + allocations + receipts/paid history
- Slice 4: ERP payment settings + invoice payments tab + refunds
- Slice 5: Worker reconciliation run + ERP reconciliation UI + fix workflow
