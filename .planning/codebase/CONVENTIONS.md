# Coding Conventions

**Analysis Date:** 2026-03-05

## Naming Patterns

**Files:**

- Use `kebab-case.ts` for all source files: `resolve-route.ts`, `agent-events.ts`, `skill-scanner.ts`
- Type-only files use `types.` prefix with domain suffix: `types.hooks.ts`, `types.agents.ts`, `types.base.ts`
- Zod schema files use `zod-schema.` prefix with domain suffix: `zod-schema.hooks.ts`, `zod-schema.core.ts`
- Test files are co-located with source, using `.test.ts` suffix: `retry.test.ts` next to `retry.ts`
- E2E tests use `.e2e.test.ts` suffix: `gateway.multi.e2e.test.ts`
- Live tests (requiring real API keys) use `.live.test.ts` suffix: `minimax.live.test.ts`
- Browser-specific tests use `.browser.test.ts`: `config-form.browser.test.ts`
- Node-specific tests use `.node.test.ts`: `usage-helpers.node.test.ts`

**Functions:**

- Use `camelCase` for all functions: `retryAsync`, `extractModelDirective`, `resolveAgentRoute`
- Prefix boolean getters with `is`/`has`/`should`: `isVerbose()`, `shouldLogVerbose()`, `isTruthyEnvValue()`
- Use `resolve` prefix for functions that compute/derive values: `resolveRetryConfig`, `resolveAgentRoute`, `resolveConfigSnapshotHash`
- Use `format` prefix for string formatting: `formatValidationErrors`, `formatTimeAgo`, `formatDurationCompact`
- Use `create` prefix for factory functions: `createConfigIO`, `createTestRegistry`, `createStubPlugin`
- Use `emit`/`on` for event functions: `emitAgentEvent`, `onAgentEvent`, `emitHeartbeatEvent`

**Variables:**

- Use `camelCase` for all variables and parameters
- Use `UPPER_SNAKE_CASE` for module-level constants: `DEFAULT_RETRY_CONFIG`, `TEST_PROCESS_MAX_LISTENERS`
- Prefix environment variable names with `MINION_` (or legacy `OPENCLAW_`): `MINION_GATEWAY_PORT`, `MINION_LIVE_TEST`

**Types:**

- Use `PascalCase` for types, interfaces, and enums: `RetryConfig`, `RetryInfo`, `HooksConfig`
- Prefer `type` over `interface` for object shapes
- Use `Schema` suffix for Zod schemas: `HookMappingSchema`, `ModelsConfigSchema`
- Use `Config` suffix for configuration types: `HooksGmailConfig`, `RetryConfig`

## Code Style

**Formatting:**

- Tool: `oxfmt` (Oxide formatter) - configured in `.oxfmtrc.jsonc`
- Import sorting enabled via `experimentalSortImports` (no newlines between groups)
- Package.json script sorting enabled via `experimentalSortPackageJson`
- Run: `pnpm format` to format, `pnpm format:check` to verify

**Linting:**

- Tool: `oxlint` (Oxide linter) with type-aware mode - configured in `.oxlintrc.json`
- Plugins enabled: `unicorn`, `typescript`, `oxc`
- Categories enforced as errors: `correctness`, `perf`, `suspicious`
- `typescript/no-explicit-any` is enforced as `error` - use `// oxlint-disable-next-line typescript/no-explicit-any` sparingly
- `curly` braces required for all control flow
- Run: `pnpm lint` to lint, `pnpm lint:fix` to auto-fix

**TypeScript:**

- Strict mode enabled in `tsconfig.json`
- Target: `es2023`, Module: `NodeNext`
- `noEmit: true` - tsdown handles compilation
- Type checking via `tsgo` (native TS compiler): `pnpm check` runs format + tsgo + lint
- File size enforced: max 500 lines per `.ts` file (checked by `scripts/check-ts-max-loc.ts` via `pnpm check:loc`)

**Pre-commit hooks:**

- Located in `git-hooks/pre-commit`
- Runs `oxlint --type-aware --fix` on staged lint-eligible files
- Runs `oxfmt --write` on staged format-eligible files
- Auto-stages fixed files

## Import Organization

**Order:**

1. Node.js built-ins: `import fs from "node:fs";`, `import path from "node:path";`
2. External packages: `import { z } from "zod";`
3. Internal absolute imports: `import { retryAsync } from "./retry.js";`

**Key rules:**

- Always use `.js` extension in import paths (ESM requirement, even for `.ts` source files)
- Use `import type` for type-only imports: `import type { MinionConfig } from "../config/config.js";`
- oxfmt auto-sorts imports (no manual ordering required)

**Path Aliases:**

- `minion/plugin-sdk` maps to `src/plugin-sdk/index.ts`
- `minion/plugin-sdk/account-id` maps to `src/plugin-sdk/account-id.ts`
- Legacy `openclaw/plugin-sdk` aliases kept for backward compatibility
- Configured in both `tsconfig.json` (paths) and `vitest.config.ts` (resolve.alias)

## Error Handling

**Patterns:**

- Prefer returning `null`/`undefined` for expected failures (e.g., `safeParseJson` returns `null` on parse error)
- Use `try/catch` with empty catch blocks for non-critical operations: `catch { // ignore cleanup errors }`
- Throw typed errors for critical failures
- Use Zod `.strict()` for configuration validation - unknown keys cause fatal validation errors
- Use `retryAsync()` from `src/infra/retry.ts` for retryable operations with exponential backoff

**Error classification pattern** (seen in extensions):

```typescript
// src/extensions/msteams/src/errors.ts pattern
export function classifyError(input: { statusCode: number }): {
  kind: "auth" | "throttled" | "transient" | "permanent";
} {
  // Classify by HTTP status, return structured error kind
}
export function formatErrorHint(classified: { kind: string }): string {
  // Return actionable user-facing hint
}
```

## Logging

**Framework:** `tslog` (via `src/logging/logger.ts`) + console output (via `src/globals.ts`)

**Patterns:**

- Use `logInfo`, `logWarn`, `logError`, `logDebug` from `src/logger.ts`
- These dual-write to both file logger (tslog) and console (themed)
- Subsystem logging via prefix convention: `"subsystem: message"` is auto-routed to subsystem logger
- Verbose/debug logging gated by `shouldLogVerbose()` or `isVerbose()`
- Never use `console.log` directly in production code - use the logger functions

## Comments

**When to Comment:**

- JSDoc on exported types and functions (especially config types in `src/config/types.*.ts`)
- `/** DANGEROUS: ... */` prefix for security-sensitive options
- `// SYNC: Fields here must also be added to:` for multi-file synchronization requirements
- Section dividers in test files use comment blocks: `// ---------------------------------------------------------------------------`

**Lint suppression:**

- Use `// oxlint-disable-next-line <rule>` (NOT eslint-disable)
- Always specify the exact rule being suppressed

## Function Design

**Size:** Max 500 lines per file enforced. Functions should be small and focused.

**Parameters:**

- Use options objects for functions with 3+ parameters: `retryAsync(fn, { attempts: 3, minDelayMs: 300 })`
- Support both simple and options-object overloads: `retryAsync(fn, 3, 300)` or `retryAsync(fn, { attempts: 3 })`
- Use `Required<T>` to resolve defaults: `resolveRetryConfig(defaults, overrides): Required<RetryConfig>`

**Return Values:**

- Use structured return objects with descriptive fields: `{ hasDirective, rawModel, cleaned }`
- Prefer returning discriminated results over throwing for expected conditions

## Module Design

**Exports:**

- Use named exports exclusively (no default exports)
- Barrel files (`index.ts`) re-export from focused sub-modules: `src/config/config.ts` re-exports from `io.js`, `paths.js`, `types.js`, etc.
- Type re-exports use `export * from` pattern: `export * from "./types.hooks.js";`

**File splitting pattern:**

- Split large type definitions into `types.<domain>.ts` files
- Split large schemas into `zod-schema.<domain>.ts` files
- Comment in barrel: `// Split into focused modules to keep files small and improve edit locality.`

**Barrel Files:** Used for config (`src/config/config.ts`), types, and public APIs. Not used in most implementation directories.

---

_Convention analysis: 2026-03-05_
