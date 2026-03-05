# Testing Patterns

**Analysis Date:** 2026-03-05

## Test Framework

**Runner:**

- Vitest 4.x
- Base config: `vitest.config.ts`
- Multiple specialized configs for different test tiers

**Assertion Library:**

- Vitest built-in `expect` (Chai-compatible)

**Run Commands:**

```bash
pnpm test              # Parallel test runner (scripts/test-parallel.mjs) - runs unit + gateway + extensions
pnpm test:fast         # Unit tests only (vitest.unit.config.ts) - excludes gateway + extensions
pnpm test:e2e          # E2E tests (vitest.e2e.config.ts) - test/**/*.e2e.test.ts + src/**/*.e2e.test.ts
pnpm test:live         # Live tests requiring real API keys (vitest.live.config.ts) - **/*.live.test.ts
pnpm test:watch        # Watch mode (base vitest config)
pnpm test:coverage     # Coverage via vitest.unit.config.ts + @vitest/coverage-v8
pnpm test:ui           # UI package tests (pnpm --dir ui test)
pnpm test:all          # Full suite: lint + build + test + e2e + live + docker tests
```

## Test Configurations

**Base config** (`vitest.config.ts`):

- Pool: `forks` (not `vmForks` - configurable per tier)
- Timeout: 120s tests, 120s hooks (180s hooks on Windows)
- `unstubEnvs: true` and `unstubGlobals: true` to prevent cross-test pollution
- Setup file: `test/setup.ts`
- Includes: `src/**/*.test.ts`, `extensions/**/*.test.ts`, `test/**/*.test.ts`
- Excludes: `**/*.live.test.ts`, `**/*.e2e.test.ts`, `dist/**`, vendor, node_modules

**Unit config** (`vitest.unit.config.ts`):

- Extends base, excludes `src/gateway/**` and `extensions/**`

**Gateway config** (`vitest.gateway.config.ts`):

- Extends base, includes only `src/gateway/**/*.test.ts`

**Extensions config** (`vitest.extensions.config.ts`):

- Extends base, includes only `extensions/**/*.test.ts`

**E2E config** (`vitest.e2e.config.ts`):

- Pool: `vmForks` (heavier isolation)
- Includes: `test/**/*.e2e.test.ts`, `src/**/*.e2e.test.ts`
- Worker count configurable via `MINION_E2E_WORKERS` env var

**Live config** (`vitest.live.config.ts`):

- Single worker (`maxWorkers: 1`) - tests hit real APIs sequentially
- Includes: `src/**/*.live.test.ts`
- Requires `MINION_LIVE_TEST=1` env var

## Test File Organization

**Location:** Co-located with source files (same directory as implementation).

**Naming conventions:**

- `<module>.test.ts` - Unit tests (default tier)
- `<module>.e2e.test.ts` - End-to-end tests
- `<module>.live.test.ts` - Live integration tests (real APIs)
- `<module>.browser.test.ts` - Browser environment tests
- `<module>.node.test.ts` - Node-specific tests
- `<module>.fuzz.test.ts` - Fuzz/property-based tests (using fast-check)

**Structure:**

```
src/
  infra/
    retry.ts                    # Implementation
    retry.test.ts               # Co-located unit test
  gateway/
    chat-sanitize.ts
    chat-sanitize.test.ts
    openresponses-parity.e2e.test.ts   # E2E in same dir
extensions/
  msteams/src/
    errors.ts
    errors.test.ts              # Extension tests also co-located
test/
  setup.ts                      # Global test setup
  test-env.ts                   # Test environment isolation
  fixtures/                     # Shared test fixtures
  helpers/                      # Shared test helpers
  mocks/                        # Shared mock modules
  *.e2e.test.ts                 # Top-level E2E tests
src/test-support/               # Reusable test utilities (importable from src)
  fetch-mock.ts
  vitest-mock-fn.ts
  channel-plugins.ts
  ports.ts
  state-dir-env.ts
```

## Test Structure

**Suite Organization:**

```typescript
import { describe, expect, it } from "vitest";
import { functionUnderTest } from "./module.js";

describe("functionUnderTest", () => {
  describe("basic functionality", () => {
    it("does X when given Y", () => {
      const result = functionUnderTest(input);
      expect(result).toBe(expected);
    });
  });

  describe("edge cases", () => {
    it("handles empty input", () => {
      expect(functionUnderTest("")).toBe("");
    });
  });
});
```

**Key conventions:**

- Import `describe`, `expect`, `it` (or `test`) from `vitest` - both `it` and `test` are used interchangeably
- Use `describe` blocks to group related tests, nested `describe` for sub-categories
- Test descriptions use present tense: "returns on first success", "strips proper think tags"
- One assertion per test is preferred, but multiple related assertions in a single test are acceptable

**Setup patterns:**

```typescript
// Global setup runs for ALL tests via test/setup.ts:
// - Isolates HOME to temp directory (prevents touching real config/state)
// - Installs process warning filter
// - Sets up default channel plugin registry
// - Cleans up fake timers after each test

// Per-file setup:
afterEach(async () => {
  for (const dir of tmpDirs) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  tmpDirs.length = 0;
});
```

## Test Environment Isolation

**Critical mechanism** (`test/test-env.ts` via `test/setup.ts`):

- Every test worker gets an isolated temp HOME directory
- Real env vars (API tokens, config paths) are saved, cleared, and restored
- Prevents tests from touching real user config/state
- Live tests bypass isolation when `MINION_LIVE_TEST=1`

```typescript
// test/setup.ts pattern
const testEnv = withIsolatedTestHome();
afterAll(() => testEnv.cleanup());
```

## Mocking

**Framework:** Vitest built-in `vi` (compatible with Jest mock API)

**Patterns:**

Simple function mocks:

```typescript
const fn = vi.fn().mockResolvedValue("ok");
const fn = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValueOnce("ok");
```

Spy on globals:

```typescript
vi.spyOn(window, "getComputedStyle").mockReturnValue({
  overflowY: "auto",
} as unknown as CSSStyleDeclaration);
```

Environment variable stubbing (auto-restored by `unstubEnvs: true`):

```typescript
vi.stubEnv("MINION_LIVE_TEST", "1");
```

Fake timers:

```typescript
vi.useFakeTimers();
const promise = retryAsync(fn, { attempts: 2 });
await vi.runAllTimersAsync();
await expect(promise).resolves.toBe("ok");
vi.useRealTimers();
// Note: test/setup.ts auto-restores real timers in afterEach
```

**Centralized mock type** (`src/test-support/vitest-mock-fn.ts`):

```typescript
export type MockFn<T extends (...args: any[]) => any = (...args: any[]) => any> =
  import("vitest").Mock<T>;
```

**Fetch mocking** (`src/test-support/fetch-mock.ts`):

```typescript
export type FetchMock = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export function withFetchPreconnect<T extends typeof fetch>(fn: T): T & FetchWithPreconnect;
```

**What to Mock:**

- External API calls and network requests
- File system operations when testing logic (not when testing FS integration)
- `window`/`document` APIs in browser tests
- Environment variables via `vi.stubEnv()`

**What NOT to Mock:**

- Pure functions under test
- Internal helper functions (test them through their callers)
- The test environment isolation (handled globally by `test/setup.ts`)

## Fixtures and Factories

**Test Data:**

```typescript
// Factory pattern for test objects
const makeError = (overrides: Partial<ErrorObject>): ErrorObject => ({
  keyword: "type",
  instancePath: "",
  schemaPath: "#/",
  params: {},
  message: "validation error",
  ...overrides,
});

// Stub creation for complex objects
const createStubPlugin = (params: { id: ChannelId; label?: string }): ChannelPlugin => ({
  /* ... */
});
```

**Fixture locations:**

- `test/fixtures/` - Shared fixture files (e.g., hook install archives)
- `test/helpers/` - Shared test helper modules
- `test/mocks/` - Shared mock modules
- `src/test-support/` - Reusable test utilities importable from within `src/`

## Coverage

**Requirements:**

- Lines: 70%
- Functions: 70%
- Branches: 55%
- Statements: 70%

**Provider:** `@vitest/coverage-v8`

**Scope:** Only `src/**/*.ts` (excludes extensions, apps, UI, tests)

**Excluded from coverage** (validated by other means):

- Entry points and CLI wiring (`src/entry.ts`, `src/cli/**`)
- Channel implementations (`src/channels/impl/**`)
- Gateway server integration surfaces (`src/gateway/server*.ts`)
- Agent integrations (`src/agents/sandbox.ts`, etc.)
- Interactive UIs/flows (`src/tui/**`, `src/wizard/**`)
- Browser module (`src/browser/**`)

**View Coverage:**

```bash
pnpm test:coverage     # Runs unit tests with v8 coverage
# Output: text (console) + lcov (for CI integration)
```

## Test Types

**Unit Tests** (`*.test.ts`):

- Fast, isolated, no external dependencies
- Co-located with source files
- Run via `pnpm test:fast` or as part of `pnpm test`
- Most numerous test type

**Integration/E2E Tests** (`*.e2e.test.ts`):

- Test multi-component interactions
- May spawn servers, use network ports
- Run via `pnpm test:e2e`
- Located in `test/` or co-located in `src/`

**Live Tests** (`*.live.test.ts`):

- Hit real external APIs (require API keys)
- Single-worker execution
- Gated by `MINION_LIVE_TEST=1`
- Run via `pnpm test:live`

**Browser Tests** (`*.browser.test.ts`):

- Test UI components in browser-like environment
- Located in `ui/src/`

**Fuzz Tests** (`*.fuzz.test.ts`):

- Property-based testing using `fast-check`
- Example: `extensions/nostr/src/nostr-bus.fuzz.test.ts`

**Docker Tests:**

- Shell-script-driven E2E tests
- Run via `pnpm test:docker:all`
- Test installation, gateway network, onboarding flows

## Parallel Test Execution

**Custom parallel runner** (`scripts/test-parallel.mjs`):

- Splits tests into multiple Vitest invocations to maximize parallelism
- Isolates known heavy/flaky test files into their own runs
- Supports `vmForks` pool for better isolation (except on Windows and Node 24)
- Configurable via `OPENCLAW_TEST_VM_FORKS`, `OPENCLAW_TEST_NO_ISOLATE` env vars

## Common Patterns

**Async Testing:**

```typescript
it("retries then succeeds", async () => {
  const fn = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValueOnce("ok");
  const result = await retryAsync(fn, 3, 1);
  expect(result).toBe("ok");
  expect(fn).toHaveBeenCalledTimes(2);
});
```

**Error Testing:**

```typescript
it("propagates after exhausting retries", async () => {
  const fn = vi.fn().mockRejectedValue(new Error("boom"));
  await expect(retryAsync(fn, 2, 1)).rejects.toThrow("boom");
  expect(fn).toHaveBeenCalledTimes(2);
});
```

**Temp directory cleanup:**

```typescript
const tmpDirs: string[] = [];
function makeTmpDir(): string {
  const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), "test-prefix-"));
  tmpDirs.push(dir);
  return dir;
}
afterEach(async () => {
  for (const dir of tmpDirs) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  tmpDirs.length = 0;
});
```

**Type assertion for test inputs:**

```typescript
const body = extractText({
  conversation: " hello ",
} as unknown as import("@whiskeysockets/baileys").proto.IMessage);
```

**Reset functions for test isolation:**

```typescript
// Production code exposes a reset function for tests
export function resetAgentRunContextForTest(): void {
  /* ... */
}

// Test uses it
test("stores and clears run context", () => {
  resetAgentRunContextForTest();
  registerAgentRunContext("run-1", { sessionKey: "main" });
  expect(getAgentRunContext("run-1")?.sessionKey).toBe("main");
});
```

---

_Testing analysis: 2026-03-05_
