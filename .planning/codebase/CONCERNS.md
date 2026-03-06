# Codebase Concerns

**Analysis Date:** 2026-03-05

## Tech Debt

**Incomplete Rebrand (OpenClaw to Minion):**

- Issue: 691 source files still reference legacy brand names (`OPENCLAW_`, `CLAWDBOT_`, `OpenClaw`, etc.). Config paths support 4+ legacy directory names (`.openclaw`, `.clawdbot`, `.moldbot`, `.moltbot`) and 5+ legacy config filenames.
- Files: `src/config/paths.ts`, `src/config/types.minion.ts`, `src/plugin-sdk/index.ts`, `src/plugins/types.ts`, `src/routing/resolve-route.ts`, `src/shared/frontmatter.ts`
- Impact: Cognitive overhead for contributors; env vars use `OPENCLAW_*` prefix while the product is "Minion"; dual naming creates confusion about which is canonical.
- Fix approach: Complete the rebrand in a systematic pass. Env vars can keep backward-compat aliases but primary should be `MINION_*`. The main type is still `OpenClawConfig` in `src/config/types.js`.

**Deprecated API Surface Accumulation:**

- Issue: 20+ `@deprecated` annotations across plugin SDK, config types, and routing. Deprecated aliases are exported alongside canonical names, widening the API surface unnecessarily.
- Files: `src/plugin-sdk/index.ts` (6 deprecated exports), `src/plugins/types.ts` (6 deprecated exports), `src/config/zod-schema.ts`, `src/config/types.minion.ts`, `src/config/types.tools.ts`
- Impact: Consumers may adopt deprecated paths; increases maintenance burden.
- Fix approach: Set a removal timeline. For plugin SDK, ship a breaking version that drops all `@deprecated` re-exports.

**Massive Config Module:**

- Issue: The `src/config/` directory contains ~18,300 lines of production code. The Zod schema alone spans ~3,800 lines across 15 files. Config loading (`src/config/io.ts`, 1190 lines) handles env var substitution, includes, merge patches, legacy migration, backup rotation, validation, and defaults all in one flow.
- Files: `src/config/io.ts`, `src/config/zod-schema.ts`, `src/config/zod-schema.providers-core.ts` (1016 lines), `src/config/zod-schema.agent-runtime.ts` (721 lines)
- Impact: Config changes are high-risk due to `.strict()` Zod schemas (unknown keys = crash-loop). The io.ts file is hard to reason about. Adding a single config field requires updates in 3+ places (see MEMORY.md "Config Schema Triple-Sync").
- Fix approach: Extract config loading phases into separate modules (parse, validate, apply-defaults, merge). Consider generating Zod schemas from TypeScript types.

**State Migration Complexity:**

- Issue: `src/infra/state-migrations.ts` (1023 lines) handles migration across multiple legacy directory layouts, session stores, WhatsApp auth, pairing data, and agent dirs. The detection logic alone defines a 13-field `LegacyStateDetection` type.
- Files: `src/infra/state-migrations.ts`, `src/infra/state-migrations.fs.ts`
- Impact: Each new migration compounds complexity. Bugs in migration logic can corrupt user state.
- Fix approach: Gate legacy migrations behind a version check; eventually remove support for pre-Minion state layouts.

**Pervasive Unsafe Type Casts:**

- Issue: Production code uses `as Record<string, unknown>`, `as unknown as`, and similar casts to bypass TypeScript's type system, especially when accessing config sub-objects. At least 20+ production files contain these patterns.
- Files: `src/gateway/server-methods/tools.ts` (lines 42-53 cast config objects to `Record<string, unknown>` then to `string[]`), `src/security/audit-extra.sync.ts` (15+ casts), `src/linq/accounts.ts`, `src/sessions/input-provenance.ts`
- Impact: Runtime type errors that TypeScript cannot catch. Config shape changes silently break downstream logic.
- Fix approach: Add properly typed accessors for config sub-objects (e.g., `resolveAgentToolsConfig(cfg, agentId)` returning a typed result). Eliminate `as Record<string, unknown>` patterns.

## Known Bugs

**Gateway Auth Token Mismatch:**

- Symptoms: CLI sends env token but gateway expects config token, resulting in "device token mismatch" errors.
- Files: `src/gateway/auth/` (auth resolution), config loading
- Trigger: When `MINION_GATEWAY_TOKEN` env var and `gateway.auth.token` config value diverge. Gateway uses config token (via `??` nullish coalescing), CLI uses env token (via `||` short-circuit).
- Workaround: Keep both values identical. Documented in MEMORY.md.

## Security Considerations

**Strict Schema Crash-Loop Risk:**

- Risk: Adding an unknown key to the JSON config causes a fatal validation error due to `.strict()` on all Zod schemas. The gateway enters a crash-loop until the config is manually fixed.
- Files: `src/config/zod-schema.ts` (20+ `.strict()` calls), `src/config/zod-schema.channels.ts`
- Current mitigation: Zod validation errors are logged with details.
- Recommendations: Consider `.passthrough()` for top-level sections with a warning log for unknown keys, or add a `--validate-config` CLI command that checks before applying.

**Process Spawning Surface:**

- Risk: The codebase spawns processes via `node:child_process` in ~20 files. The bash tool execution path (`src/agents/bash/bash-tools.exec.ts`, 1119 lines) is a critical security boundary.
- Files: `src/agents/bash/bash-tools.exec.ts`, `src/platform/process/exec.ts`, `src/platform/process/spawn-utils.ts`, `src/platform/process/kill-tree.ts`
- Current mitigation: Sandbox configuration, tool policy profiles, command risk classification (`src/security/command-risk.test.ts`), audit system (`src/security/audit-extra.sync.ts`, `src/security/audit-extra.async.ts`).
- Recommendations: Ensure all spawn paths go through the sandbox policy layer. The exec.ts and spawn-utils.ts files should not be called directly by non-security-audited code.

**Plugin Installation Security:**

- Risk: Plugin install flow checks for dangerous patterns in plugin code (tested in `src/plugins/install.e2e.test.ts`), but detection is pattern-based and bypassable.
- Files: `src/plugins/install.e2e.test.ts` (lines 360-383)
- Current mitigation: Pattern matching for dangerous require/exec calls.
- Recommendations: Consider running plugins in a sandboxed context (WASM or subprocess with restricted permissions).

## Performance Bottlenecks

**Large File Complexity:**

- Problem: 28 production files exceed 500 lines. The largest (`src/channels/impl/discord/monitor/agent-components.ts`) is 1657 lines. These files handle too many responsibilities.
- Files: `src/channels/impl/discord/monitor/agent-components.ts` (1657), `src/agents/pi-embedded-runner/run/attempt.ts` (1315), `src/auto-reply/reply/smart-routing.ts` (1254), `src/memory/compaction/qmd-manager.ts` (1242), `src/channels/impl/telegram/bot-handlers.ts` (1217), `src/infra/heartbeat-runner.ts` (1201)
- Cause: Feature accretion without refactoring. Each file has grown to handle edge cases.
- Improvement path: Extract sub-functions into focused modules. The Discord agent-components file should split UI component handling from message dispatch. The heartbeat runner should separate scheduling from execution.

**Config Path Resolution Overhead:**

- Problem: `resolveStateDir()`, `resolveConfigPath()`, and `resolveDefaultConfigCandidates()` perform synchronous `fs.existsSync()` calls across 5+ legacy directories and 6+ config filenames on every invocation.
- Files: `src/config/paths.ts` (lines 66-95, 142-157, 203-233)
- Cause: Supporting 4 legacy directory names and 5 legacy config filenames creates a combinatorial explosion of filesystem probes.
- Improvement path: Cache results after first resolution. The module already exports `STATE_DIR` and `CONFIG_PATH` as constants, but functions like `resolveConfigPath()` are called with different parameters throughout the codebase.

## Fragile Areas

**Config Schema Triple-Sync:**

- Files: `src/config/types.hooks.ts`, `src/config/zod-schema.hooks.ts`, `src/hooks/gog-oauth-types.ts`
- Why fragile: Adding a field to hooks config requires updating 3 separate files in sync. Missing one causes either TypeScript errors (catchable) or runtime Zod `.strict()` crashes (not catchable until deployment).
- Safe modification: Always update all three files. Test with `--validate-config` if available. Search for all `@deprecated` aliases when renaming.
- Test coverage: No dedicated test that the three schemas stay in sync.

**Context Overflow Recovery Loop:**

- Files: `src/agents/pi-embedded-runner/run.ts` (lines 473-737)
- Why fragile: The overflow compaction retry loop has 3 max attempts with nested error handling, multiple bailout conditions, and interleaved compaction strategies. The logic spans ~260 lines with 5+ nested conditionals.
- Safe modification: Add integration tests for each bailout path. Currently tested only via e2e tests on the parent `attempt.ts`.
- Test coverage: `run.ts` has no unit test file.

**Gateway Server Methods:**

- Files: `src/gateway/server-methods/` (50+ files)
- Why fragile: Most server method handlers lack unit tests. Of ~40 handler files, only 6 have corresponding test files (`agent.ts`, `mesh.ts`, `push.ts`, `send.ts`, `update.ts`, `usage.ts`). The `chat.ts` handler (1076 lines) has no dedicated unit tests.
- Safe modification: Add test coverage before modifying. Use e2e gateway tests (`src/gateway/server.cron.e2e.test.ts`) as a safety net.
- Test coverage: ~15% of gateway server method files have tests.

## Scaling Limits

**Session File Storage:**

- Current capacity: Sessions stored as JSON files on local filesystem.
- Limit: Concurrent access from multiple channels to the same session can race. File I/O becomes a bottleneck with many active sessions.
- Scaling path: The codebase has `src/config/sessions/store.ts` (934 lines) managing file-based session state. Moving to a database or in-memory store with WAL would improve concurrency.

## Dependencies at Risk

**Legacy Name Aliases in Environment:**

- Risk: Environment variables support 3 prefixes (`MINION_*`, `OPENCLAW_*`, `CLAWDBOT_*`) via fallback chains using `||` and `??` operators. Different fallback operators in different locations create inconsistent precedence.
- Impact: Debugging env var resolution requires tracing through multiple fallback chains. The gateway auth token mismatch bug is a direct consequence of this pattern.
- Migration plan: Standardize on `MINION_*` prefix. Log deprecation warnings when legacy prefixes are used. Remove after one major version.

## Missing Critical Features

**Config Validation CLI:**

- Problem: No standalone `minion config validate` command that checks config validity without starting the gateway.
- Blocks: Safe config editing workflows. Users must restart the gateway to discover `.strict()` Zod validation errors, which causes a crash-loop.

## Test Coverage Gaps

**Gateway Server Methods:**

- What's not tested: `chat.ts` (1076 lines), `tools.ts`, `sessions.ts`, `config.ts`, `channels.ts`, `browser.ts`, `cron.ts`, `devices.ts`, `memory.ts`, `models.ts`, `nodes.ts`, `specialists.ts`, `system.ts`, `talk.ts`, `tts.ts`, `web.ts`, `wizard.ts`
- Files: `src/gateway/server-methods/*.ts`
- Risk: Gateway API changes can break clients silently. The chat handler is the most critical user-facing code path and has no unit tests.
- Priority: High

**Core Agent Runner:**

- What's not tested: `src/agents/pi-embedded-runner/run.ts` (1084 lines) has no unit test. The retry/failover/compaction logic is only covered indirectly via e2e tests on `attempt.ts`.
- Files: `src/agents/pi-embedded-runner/run.ts`
- Risk: Failover and context overflow recovery regressions go unnoticed until production.
- Priority: High

**Heartbeat Runner:**

- What's not tested: `src/infra/heartbeat-runner.ts` (1201 lines) has no test file. Manages scheduled agent invocations, cron events, and session compaction.
- Files: `src/infra/heartbeat-runner.ts`
- Risk: Heartbeat scheduling bugs affect all automated agent behaviors.
- Priority: Medium

**Config I/O:**

- What's not tested: `src/config/io.ts` (1190 lines) has no unit test. Handles the entire config loading pipeline.
- Files: `src/config/io.ts`
- Risk: Config loading regressions cause gateway startup failures (crash-loops).
- Priority: High

---

_Concerns audit: 2026-03-05_
