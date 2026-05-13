# Monorepo Scaffold Implementation Plan (pnpm + Turborepo)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a runnable monorepo skeleton with NestJS+Prisma API, React web app, Tauri wrapper, Expo mobile app, Next.js portal placeholder, shared packages, lint/format/commit hooks, and GitHub Actions CI.

**Architecture:** pnpm workspaces + Turborepo for orchestration. Each app is independently runnable but shares TypeScript config, linting rules, and common packages (`@repo/shared`, `@repo/security`).

**Tech Stack:** TypeScript, pnpm, Turborepo, NestJS, Prisma, React (Vite), Tauri, Expo, Next.js, Zod, ESLint, Prettier, Husky, lint-staged, commitlint, GitHub Actions.

---

## Task 1: Root workspace + tooling

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `tsconfig.json`
- Create: `eslint.config.js`
- Create: `.prettierrc`
- Create: `.prettierignore`
- Create: `.editorconfig`
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `README.md`

- [ ] **Step 1: Create root `package.json`**

Create `package.json`:

```json
{
  "name": "pharmacy-erp",
  "private": true,
  "packageManager": "pnpm@9.12.3",
  "engines": {
    "node": ">=20 <21"
  },
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "format": "prettier -w .",
    "prepare": "husky"
  },
  "devDependencies": {
    "@commitlint/cli": "^19.5.0",
    "@commitlint/config-conventional": "^19.5.0",
    "@eslint/js": "^9.0.0",
    "eslint": "^9.0.0",
    "husky": "^9.1.0",
    "lint-staged": "^15.2.0",
    "prettier": "^3.3.0",
    "turbo": "^2.1.0",
    "typescript": "^5.6.0",
    "typescript-eslint": "^8.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create pnpm workspace config**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create Turborepo pipeline**

Create `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^lint"],
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^typecheck"],
      "outputs": []
    },
    "test": {
      "dependsOn": ["^test"],
      "outputs": []
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "build/**"]
    }
  }
}
```

- [ ] **Step 4: Create TypeScript configs**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "types": ["node"]
  }
}
```

Create `tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./packages/shared" },
    { "path": "./packages/security" },
    { "path": "./apps/api" },
    { "path": "./apps/erp-web" },
    { "path": "./apps/portal-pwa" }
  ]
}
```

- [ ] **Step 5: Create ESLint flat config**

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
    },
    rules: {
      "no-console": "off"
    }
  },
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/build/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/src-tauri/target/**"
    ]
  }
);
```

- [ ] **Step 6: Create Prettier config**

Create `.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": false,
  "printWidth": 100,
  "trailingComma": "none"
}
```

Create `.prettierignore`:

```gitignore
node_modules
dist
.next
build
.turbo
coverage
src-tauri/target
```

- [ ] **Step 7: Create editor and git ignores**

Create `.editorconfig`:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true
```

Create `.gitignore`:

```gitignore
node_modules
dist
.next
build
.turbo
coverage
.env
.env.*
src-tauri/target
```

Create `.nvmrc`:

```
20
```

- [ ] **Step 8: Create root README**

Create `README.md`:

````md
# Pharmacy ERP Monorepo

## Requirements

- Node.js 20 LTS
- pnpm

## Setup

```bash
pnpm i
```
````

## Dev

```bash
pnpm dev
```

## Lint / Typecheck / Test

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## Build

```bash
pnpm build
```

## App commands

### API (NestJS)

```bash
pnpm --filter @repo/api dev
pnpm --filter @repo/api prisma:generate
pnpm --filter @repo/api prisma:migrate:dev
```

### ERP Web (React)

```bash
pnpm --filter @repo/erp-web dev
```

### Desktop (Tauri)

```bash
pnpm --filter @repo/desktop dev
```

### Mobile (Expo)

```bash
pnpm --filter @repo/mobile dev
```

### Portal PWA (Next.js)

```bash
pnpm --filter @repo/portal-pwa dev
```

````

- [ ] **Step 9: Install dependencies**

Run:
```bash
pnpm i
````

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "chore: init monorepo tooling"
```

## Task 2: Shared packages (`@repo/shared`, `@repo/security`)

**Files:**

- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/schemas/example.ts`
- Create: `packages/security/package.json`
- Create: `packages/security/tsconfig.json`
- Create: `packages/security/src/index.ts`
- Create: `packages/security/src/redact.ts`
- Create: `packages/security/src/rbac.ts`
- Create: `packages/security/src/audit.ts`
- Create: `packages/security/src/crypto.ts`
- Test: `packages/security/src/redact.test.ts`

- [ ] **Step 1: Create shared package**

Create `packages/shared/package.json`:

```json
{
  "name": "@repo/shared",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint src --max-warnings=0",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.23.0"
  }
}
```

Create `packages/shared/tsconfig.json`:

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

Create `packages/shared/src/schemas/example.ts`:

```ts
import { z } from "zod";

export const ExampleDto = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime()
});

export type ExampleDto = z.infer<typeof ExampleDto>;
```

Create `packages/shared/src/index.ts`:

```ts
export * from "./schemas/example.js";
```

- [ ] **Step 2: Create security package**

Create `packages/security/package.json`:

```json
{
  "name": "@repo/security",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint src --max-warnings=0",
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

Create `packages/security/src/redact.ts`:

```ts
const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "api_key",
  "secret",
  "ghanaCardId",
  "nhisNumber",
  "phone",
  "email"
]);

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.has(k) ? "[REDACTED]" : redact(v);
    }
    return out;
  }
  return value;
}
```

Create `packages/security/src/rbac.ts`:

```ts
export type PermissionKey = string;

export type PermissionGrant = {
  permissionKey: PermissionKey;
  effect: "ALLOW" | "DENY";
  branchId: string | null;
};

export function can(args: {
  requested: PermissionKey;
  branchId: string | null;
  rolePermissions: PermissionKey[];
  userGrants: PermissionGrant[];
}) {
  const roleAllows = new Set(args.rolePermissions);
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

Create `packages/security/src/audit.ts`:

```ts
export type AuditEvent = {
  tenantId: string;
  branchId: string | null;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  idempotencyKey: string;
  requestId: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
};
```

Create `packages/security/src/crypto.ts`:

```ts
export type EnvelopeEncryptor = {
  encrypt: (plaintext: Uint8Array, tenantId: string) => Promise<Uint8Array>;
  decrypt: (ciphertext: Uint8Array, tenantId: string) => Promise<Uint8Array>;
};
```

Create `packages/security/src/index.ts`:

```ts
export * from "./redact.js";
export * from "./rbac.js";
export * from "./audit.js";
export * from "./crypto.js";
```

- [ ] **Step 3: Add a unit test for redaction**

Create `packages/security/src/redact.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { redact } from "./redact.js";

describe("redact", () => {
  it("redacts sensitive keys recursively", () => {
    const x = redact({
      email: "a@b.com",
      profile: { phone: "0200000000" },
      ok: "yes"
    });
    expect(x).toEqual({
      email: "[REDACTED]",
      profile: { phone: "[REDACTED]" },
      ok: "yes"
    });
  });
});
```

- [ ] **Step 4: Run typecheck/test for packages**

Run:

```bash
pnpm typecheck
pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add shared and security packages"
```

## Task 3: apps/api (NestJS + Prisma) skeleton

**Files:**

- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/tsconfig.build.json`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/.env.example`
- Create: `apps/api/test/app.e2e-spec.ts`
- Create: `apps/api/nest-cli.json`

- [ ] **Step 1: Add NestJS deps**

Run:

```bash
pnpm add -w @nestjs/common @nestjs/core @nestjs/platform-express reflect-metadata rxjs
pnpm add -w -D @nestjs/cli @nestjs/testing @types/express ts-node tsx
pnpm add -w prisma @prisma/client
```

- [ ] **Step 2: Create API package.json**

Create `apps/api/package.json`:

```json
{
  "name": "@repo/api",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/main.js",
    "lint": "eslint src test --max-warnings=0",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "prisma:generate": "prisma generate",
    "prisma:migrate:dev": "prisma migrate dev",
    "prisma:studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^5.0.0",
    "@repo/security": "workspace:*",
    "@repo/shared": "workspace:*",
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/platform-express": "^10.0.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0"
  },
  "devDependencies": {
    "prisma": "^5.0.0",
    "tsx": "^4.19.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: Create TS configs**

Create `apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

Create `apps/api/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "include": ["src/**/*.ts"],
  "exclude": ["test/**/*.ts"]
}
```

- [ ] **Step 4: Create minimal Nest module**

Create `apps/api/src/app.module.ts`:

```ts
import { Module } from "@nestjs/common";

@Module({
  imports: []
})
export class AppModule {}
```

Create `apps/api/src/main.ts`:

```ts
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

const app = await NestFactory.create(AppModule);
await app.listen(3000);
```

- [ ] **Step 5: Add Prisma schema + env example**

Create `apps/api/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Tenant {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now())
}
```

Create `apps/api/.env.example`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pharmacy"
```

- [ ] **Step 6: Add a minimal unit test**

Create `apps/api/test/app.e2e-spec.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("api", () => {
  it("boots", () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 7: Run checks**

Run:

```bash
pnpm typecheck
pnpm test
```

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat(api): add nestjs+prisma skeleton"
```

## Task 4: apps/erp-web (React + Vite) skeleton

**Files:**

- Create: `apps/erp-web/package.json`
- Create: `apps/erp-web/tsconfig.json`
- Create: `apps/erp-web/vite.config.ts`
- Create: `apps/erp-web/index.html`
- Create: `apps/erp-web/src/main.tsx`
- Create: `apps/erp-web/src/App.tsx`
- Create: `apps/erp-web/src/App.test.tsx`

- [ ] **Step 1: Add deps**

Run:

```bash
pnpm add -w react react-dom
pnpm add -w -D vite @vitejs/plugin-react @types/react @types/react-dom jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: Create package.json**

Create `apps/erp-web/package.json`:

```json
{
  "name": "@repo/erp-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint src --max-warnings=0",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@repo/security": "workspace:*",
    "@repo/shared": "workspace:*",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "jsdom": "^25.0.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: TS + Vite config**

Create `apps/erp-web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "vite.config.ts"]
}
```

Create `apps/erp-web/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()]
});
```

- [ ] **Step 4: Minimal app**

Create `apps/erp-web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ERP Web</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `apps/erp-web/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `apps/erp-web/src/App.tsx`:

```tsx
import { ExampleDto } from "@repo/shared";
import { redact } from "@repo/security";

export function App() {
  const parsed = ExampleDto.safeParse({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  });

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>ERP Web</h1>
      <pre>
        {JSON.stringify(redact(parsed.success ? parsed.data : parsed.error.format()), null, 2)}
      </pre>
    </div>
  );
}
```

- [ ] **Step 5: Add vitest config + test**

Create `apps/erp-web/src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

describe("App", () => {
  it("renders title", () => {
    render(<App />);
    expect(screen.getByText("ERP Web")).toBeTruthy();
  });
});
```

- [ ] **Step 6: Run checks**

Run:

```bash
pnpm typecheck
pnpm test
```

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat(erp-web): add react+vite skeleton"
```

## Task 5: apps/desktop (Tauri wrapper) skeleton

**Files:**

- Create: `apps/desktop/package.json`
- Create: `apps/desktop/src-tauri/tauri.conf.json`
- Create: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/src/main.rs`
- Create: `apps/desktop/src/index.html`

- [ ] **Step 1: Create package.json**

Create `apps/desktop/package.json`:

```json
{
  "name": "@repo/desktop",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "echo \"Run Tauri dev via native toolchain (tauri cli).\"",
    "build": "echo \"Run Tauri build via native toolchain (tauri cli).\"",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Add minimal Tauri config that loads erp-web**

Create `apps/desktop/src-tauri/tauri.conf.json`:

```json
{
  "build": {
    "beforeDevCommand": "pnpm --filter @repo/erp-web dev",
    "beforeBuildCommand": "pnpm --filter @repo/erp-web build",
    "devPath": "http://localhost:5173",
    "distDir": "../erp-web/dist"
  },
  "package": {
    "productName": "Pharmacy ERP Desktop",
    "version": "0.1.0"
  }
}
```

- [ ] **Step 3: Add Rust placeholders**

Create `apps/desktop/src-tauri/Cargo.toml`:

```toml
[package]
name = "pharmacy-erp-desktop"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "1", features = [] }
```

Create `apps/desktop/src-tauri/src/main.rs`:

```rs
fn main() {
  println!("Tauri placeholder");
}
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "chore(desktop): add tauri wrapper skeleton"
```

## Task 6: apps/mobile (Expo) placeholder package

**Files:**

- Create: `apps/mobile/package.json`
- Create: `apps/mobile/tsconfig.json`
- Create: `apps/mobile/src/App.tsx`
- Create: `apps/mobile/src/App.test.ts`

- [ ] **Step 1: Create package.json (placeholder)**

Create `apps/mobile/package.json`:

```json
{
  "name": "@repo/mobile",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "echo \"Run Expo dev via expo cli\"",
    "build": "echo \"Use EAS build\"",
    "lint": "eslint src --max-warnings=0",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@repo/shared": "workspace:*",
    "@repo/security": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.0.0"
  }
}
```

Create `apps/mobile/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

Create `apps/mobile/src/App.tsx`:

```tsx
export function App() {
  return null;
}
```

Create `apps/mobile/src/App.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("mobile placeholder", () => {
  it("exists", () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "chore(mobile): add expo placeholder package"
```

## Task 7: apps/portal-pwa (Next.js placeholder)

**Files:**

- Create: `apps/portal-pwa/package.json`
- Create: `apps/portal-pwa/tsconfig.json`
- Create: `apps/portal-pwa/next.config.mjs`
- Create: `apps/portal-pwa/app/page.tsx`
- Create: `apps/portal-pwa/app/layout.tsx`

- [ ] **Step 1: Add deps**

Run:

```bash
pnpm add -w next react react-dom
```

- [ ] **Step 2: Create Next.js package**

Create `apps/portal-pwa/package.json`:

```json
{
  "name": "@repo/portal-pwa",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@repo/shared": "workspace:*",
    "@repo/security": "workspace:*",
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.0.0"
  }
}
```

Create `apps/portal-pwa/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

Create `apps/portal-pwa/next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true
};

export default nextConfig;
```

Create `apps/portal-pwa/app/layout.tsx`:

```tsx
export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{props.children}</body>
    </html>
  );
}
```

Create `apps/portal-pwa/app/page.tsx`:

```tsx
export default function Page() {
  return <h1>Portal PWA (placeholder)</h1>;
}
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "chore(portal): add nextjs placeholder"
```

## Task 8: Git hooks + lint-staged + commitlint

**Files:**

- Create: `.husky/pre-commit`
- Create: `.husky/commit-msg`
- Create: `commitlint.config.cjs`
- Modify: `package.json`

- [ ] **Step 1: Configure lint-staged**

Modify root `package.json` to add:

```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx,mjs,cjs}": ["eslint --fix", "prettier -w"],
    "*.{json,md,yml,yaml}": ["prettier -w"]
  }
}
```

- [ ] **Step 2: Add commitlint config**

Create `commitlint.config.cjs`:

```js
module.exports = { extends: ["@commitlint/config-conventional"] };
```

- [ ] **Step 3: Enable Husky hooks**

Run:

```bash
pnpm dlx husky init
```

Replace `.husky/pre-commit` with:

```sh
pnpm lint-staged
```

Create `.husky/commit-msg`:

```sh
pnpm dlx commitlint --edit "$1"
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "chore: add husky lint-staged and commitlint"
```

## Task 9: GitHub Actions CI

**Files:**

- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Add CI workflow**

Create `.github/workflows/ci.yml`:

```yml
name: CI

on:
  pull_request:
    branches: ["**"]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install
        run: pnpm i --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "ci: add lint/typecheck/test pipeline"
```

## Task 10: Final verification

- [ ] **Step 1: Run repo checks**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

- [ ] **Step 2: Commit any fixes**

---

## Plan Self-Review

- Covers requested apps/packages and all requested tooling (eslint/prettier/husky/lint-staged/commitlint/CI).
- No hardcoded secrets: `.env.example` only; `.env` ignored.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-12-monorepo-scaffold.md`.

Two execution options:

1. Subagent-Driven (recommended)
2. Inline Execution

Which approach?
