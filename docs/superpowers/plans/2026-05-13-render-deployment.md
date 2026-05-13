# Render Deployment (Staging + Production) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the monorepo to Render with staging + production: API web service (Docker) + BullMQ worker (Docker background worker) + separate Postgres/Redis per environment, S3-compatible storage via env vars, security middleware, health endpoints, and CI/CD rules.

**Architecture:** Use a `render.yaml` blueprint to declare all Render resources. Build and run `apps/api` as a Docker web service and a new `apps/worker` as a Docker background worker. Provide `/health` and `/ready` endpoints and apply CORS allowlist, security headers (incl. HSTS in staging/prod), and targeted rate limiting. Staging can run migrations automatically; production migrations are manual (one-off job) with a rollback/backups checklist.

**Tech Stack:** Render (Blueprint), Docker, NestJS, BullMQ + Redis, Postgres, pnpm/turbo.

---

## File Structure (new/modified)

- Create: `apps/api/Dockerfile`
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/src/main.ts`
- Create: `apps/worker/src/smoke.test.ts`
- Create: `apps/worker/Dockerfile`
- Create: `render.yaml`
- Modify: `pnpm-workspace.yaml` (ensure `apps/*` included)
- Modify: `turbo.json` (ensure build dependencies wired; already present but verify)
- Modify: `apps/api/src/main.ts` (security middleware + cors + rate limit + dynamic port)
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/src/health/health.module.ts`
- Modify: `apps/api/src/app.module.ts` (import HealthModule)
- Create: `apps/api/src/common/env.ts`
- Create: `apps/api/src/common/security-headers.ts`
- Create: `apps/api/src/common/cors.ts`
- Create: `apps/api/src/common/rate-limit.ts`
- Modify: `apps/api/package.json` (add `cors`)
- Create: `docs/deploy/render.md`

---

### Task 1: Add worker app (BullMQ) as a first-class workspace package

**Files:**

- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/src/main.ts`
- Create: `apps/worker/src/smoke.test.ts`
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Create `apps/worker/package.json`**

```json

```
