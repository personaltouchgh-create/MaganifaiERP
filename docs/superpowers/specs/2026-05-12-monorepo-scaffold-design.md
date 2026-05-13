# Pharmacy ERP Monorepo Scaffold (pnpm + Turborepo)

Date: 2026-05-12

## Goal

Create a runnable monorepo skeleton with standardized tooling and CI for a multi-tenant Pharmacy ERP SaaS:

- `apps/api`: NestJS (TypeScript) + Prisma
- `apps/erp-web`: React (TypeScript) shared UI for desktop
- `apps/desktop`: Tauri wrapper (loads `erp-web`)
- `apps/mobile`: Expo (React Native, TypeScript)
- `apps/portal-pwa`: Next.js PWA (placeholder)
- `packages/shared`: Zod schemas, DTOs, enums, common utilities
- `packages/security`: crypto helpers, RBAC helpers, audit helpers, log redaction

Includes repo-wide:

- ESLint, Prettier
- Husky + lint-staged
- commitlint (conventional commits)
- Workspace scripts for dev/test/build
- GitHub Actions CI: lint + typecheck + unit tests on PR

## Decisions

- Package manager: `pnpm`
- Task orchestration: Turborepo
- Node runtime: Node 20 LTS (repo pinned)
- Mobile: Expo-managed
- CI provider: GitHub Actions

## Non-negotiables (Applied)

- No hardcoded secrets: only `.env.example` committed; `.env` ignored.
- Security helpers: log redaction utilities included from day 0; crypto helpers are injectable and do not embed keys.

## Approaches Considered

### A) Minimal skeleton only

Folders + minimal `package.json` placeholders.

- Pros: fastest.
- Cons: not runnable; CI provides little value.

### B) Generator-driven scaffolding

Use `nest new`, `create-vite`, `create-tauri-app`, `create-expo-app`, `create-next-app`.

- Pros: closer to typical project boots.
- Cons: generator drift, extra flags, lower determinism across machines and CI.

### C) Deterministic repo template scaffold (Chosen)

Create the full folder structure and config files with minimal runnable entrypoints per app; avoid generator dependency.

- Pros: deterministic, CI-stable, easy to extend.
- Cons: initial boilerplate must be curated.

## Repository Structure

```
.
├─ apps/
│  ├─ api/            # NestJS + Prisma
│  ├─ erp-web/        # React (Vite) shared UI
│  ├─ desktop/        # Tauri wrapper for erp-web
│  ├─ mobile/         # Expo RN app
│  └─ portal-pwa/     # Next.js placeholder (PWA-ready)
├─ packages/
│  ├─ shared/         # Zod schemas, DTOs, enums, utils
│  └─ security/       # crypto/RBAC/audit/log redaction
├─ .github/workflows/ci.yml
├─ turbo.json
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ eslint.config.js
├─ .prettierrc
├─ .editorconfig
└─ README.md
```

## Workspaces and Scripts

### Root scripts

- `pnpm dev`: turbo dev for runnable apps
- `pnpm lint`: turbo lint
- `pnpm typecheck`: turbo typecheck
- `pnpm test`: turbo test
- `pnpm build`: turbo build

### Turborepo pipeline

- `dev`: not cached
- `lint/typecheck/test/build`: cached, depend on upstream packages

## App-specific Notes

### apps/api (NestJS + Prisma)

- Prisma folder at `apps/api/prisma/`
- `.env.example` includes `DATABASE_URL=postgresql://...`
- Prisma scripts:
  - `prisma:generate`
  - `prisma:migrate:dev`
  - `prisma:studio`

### apps/erp-web (React + Vite)

- Uses `@repo/shared` and `@repo/security` packages

### apps/desktop (Tauri)

- Dev points to `erp-web` dev server URL
- Build loads `apps/erp-web/dist`

### apps/mobile (Expo)

- Kept minimal; CI focuses on TypeScript + unit tests (no emulator requirements)

### apps/portal-pwa (Next.js)

- Placeholder now; minimal page + config only, but buildable

## packages/shared

- `src/index.ts` exports:
  - zod schemas (DTO validation)
  - shared enums
  - common types

## packages/security

- `src/redact.ts`: redaction helpers for logging (PII/PHI-safe)
- `src/rbac.ts`: RBAC helper types and basic evaluation interface
- `src/audit.ts`: audit event type definitions
- `src/crypto.ts`: crypto helper surface (no embedded keys; inputs injected)

## Linting / Formatting / Commits

- ESLint at repo root using flat config (`eslint.config.js`)
- Prettier configured at root
- Husky:
  - `pre-commit`: `lint-staged`
  - `commit-msg`: `commitlint`
- lint-staged:
  - `eslint --fix` on TS/JS
  - `prettier -w` on common text files

## CI (GitHub Actions)

On PR:

- Checkout
- Setup Node 20
- Setup pnpm
- Install with lockfile
- Run:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`

## Security Baseline

- `.env` ignored; `.env.example` committed per app needing env vars.
- No secrets in repo or CI logs.
- Log redaction helper used by default logger integrations (future step).
