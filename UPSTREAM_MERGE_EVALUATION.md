# Upstream Merge Evaluation

## Overview

| Field                 | Value                                                                         |
| --------------------- | ----------------------------------------------------------------------------- |
| **Date**              | 2026-02-16                                                                    |
| **Merge base**        | `513576b48` fix(test): disable safeBins expectations on Windows               |
| **Mirror (upstream)** | `dacffd7ac` fix(sandbox): parse Windows bind mounts in fs-path mapping        |
| **DEV (fork)**        | `4ca4b2b78` fix(infra): 3 improvements from infrastructure audit observations |
| **Upstream commits**  | 1,428 (non-merge)                                                             |
| **Upstream files**    | 2,848 (1,082 added, 1,539 modified, 217 deleted)                              |
| **Fork commits**      | 147 (non-merge) since merge-base                                              |

## Conflict Summary

| Category                           | Files   | Resolution                                | Effort    |
| ---------------------------------- | ------- | ----------------------------------------- | --------- |
| **A. Upstream-only**               | 1,966   | Auto-accept (no conflict)                 | None      |
| **B. Fork-only**                   | 1,711   | Auto-keep (no conflict)                   | None      |
| **C. Pure rebrand conflicts**      | 313     | Accept upstream → re-apply rebrand script | Automated |
| **D. Extension package.json**      | 30      | Accept upstream → re-apply scoped name    | Scripted  |
| **E. Infrastructure**              | 5       | Manual 3-way merge                        | ~30 min   |
| **F. Source code (fork features)** | 13      | Manual merge                              | ~1 hr     |
| **G. Extension source**            | 1       | Manual merge                              | ~5 min    |
| **H. Docs/other**                  | 4       | Accept upstream or keep ours              | ~10 min   |
| **Total actual conflicts**         | **366** |                                           |           |

**Additionally**: 127 untracked local files block the merge (upstream wants to create files that already exist locally untracked). These must be `git add`ed or removed before merge.

---

## A. Upstream-Only Changes (1,966 files — auto-accept)

These files were only changed upstream and don't exist on the fork side. They will merge cleanly with zero conflicts.

### Key New Features Worth Noting

- **iOS Onboarding Wizard** (30+ files) — `apps/ios/Sources/Onboarding/OnboardingWizardView.swift` (852 lines), QR scanner, setup flow, state store
- **Tool Loop Detection** — `src/agents/tool-loop-detection.ts` (527 lines), detects/breaks stuck agent loops
- **Command Poll Backoff** — `src/agents/command-poll-backoff.ts` (82 lines)
- **QR CLI** — `src/cli/qr-cli.ts` (183 lines), `src/cli/clawbot-cli.ts`
- **Plugin SDK Expansion** — `command-auth.ts`, `json-store.ts`, `slack-message-actions.ts`, `tool-send.ts`, `webhook-targets.ts`
- **Telegram Restructure** — new `button-types.ts`, `group-access.ts`, bot-message-context test harness
- **Discord Component v2** — exec options, reusable components, per-button allowlists, thread creation
- **Auth Profile Improvements** — stale cooldown auto-expiry, credential sync
- **Process Management** — SIGTERM-before-SIGKILL tree termination, `windowsHide` on spawn
- **Test Infrastructure** — 50+ new test harness/fixture files
- **Upstream Deletions** (4 files, fork doesn't depend on any):
  - `src/telegram/download.ts`, `src/telegram/index.ts`, `src/telegram/webhook-set.ts`
  - `src/auto-reply/reply.triggers...security.test.ts`

**Action**: None needed — these merge cleanly.

---

## B. Fork-Only Changes (1,711 files — auto-keep)

These files exist only on the fork and have no upstream counterpart. No conflicts.

### Key Fork-Specific Paths

- `setup/` (entire directory — phases, lib, config, utilities)
- `.claude/` (skills: fork-sync, lessons-learned, provision-server)
- `.github/workflows/npm-publish.yml`, `deploy-production.yml`
- `.github/actions/docker-tag/`, `.github/servers/`
- `extensions/agent-switcher/`, `extensions/squid/`
- `src/hooks/gog-*.ts` (Google OAuth)
- `packages/minionbot/`, `docs/deployment/`, `docs/fork/`
- `.agent/`, `.agents/` (fork skill files)

**Action**: None needed — these won't appear in conflicts.

---

## C. Pure Rebrand Conflicts (313 files — automated resolution)

Files touched ONLY by the rebrand commit (`8dfb2e9d8 chore: rebrand OpenClaw → Minion`). Upstream made functional changes; the fork only renamed identifiers.

### Breakdown

- 270 in `src/` (mostly test files with renamed fixtures/assertions)
- 22 in `extensions/` (non-package.json source files)
- 8 in `ui/`
- 13 other (scripts, appcast.xml, skills, docs, configs)

### Resolution Strategy

1. **During merge**: Accept upstream's version (`git checkout --theirs <file>`)
2. **Post-merge**: Run automated rebrand script across all 313 files:

```bash
# Rebrand substitution map (order matters — longer patterns first)
sed -i 's/OpenClawConfig/MinionConfig/g'
sed -i 's/OpenClawSchema/MinionSchema/g'
sed -i 's/resolveOpenClawAgentDir/resolveMinionAgentDir/g'
sed -i 's/ensureOpenClawCliOnPath/ensureMinionCliOnPath/g'
sed -i 's/OPENCLAW_/MINION_/g'
sed -i 's/CLAWDBOT_/MINIONBOT_/g'
sed -i 's/openclaw\.mjs/minion.mjs/g'
sed -i 's/~\/.openclaw/~\/.minion/g'
# Package-level renames
sed -i 's/"openclaw"/"@nikolasp98\/minion"/g'  # in package.json context
```

**EXCEPTION — Do NOT rebrand these native app paths:**

- `OpenClaw.app`, `OpenClaw.xcodeproj`
- `OpenClawKit/`, `OpenClawProtocol/`
- `OpenClawChatUI/`
- `apps/ios/Sources/OpenClawApp.swift`
- `ai.openclaw.android` (Android bundle ID — needs separate decision)

---

## D. Extension package.json Conflicts (30 files — scripted resolution)

All 30 extension `package.json` files have the same conflict pattern:

**Fork changes** (rebrand + scoped dep):

```json
{
  "name": "@minion/discord",         // was @openclaw/discord
  "description": "Minion Discord...", // was OpenClaw Discord...
  "devDependencies": {
    "@nikolasp98/minion": "workspace:*"  // was "openclaw": "workspace:*"
  },
  "minion": { ... }                  // was "openclaw": { ... }
}
```

**Upstream changes**: version bumps, possible new dependencies

**Resolution**:

1. Accept upstream version
2. Re-apply scoped naming:
   - `@openclaw/*` → `@minion/*`
   - `"openclaw": "workspace:*"` → `"@nikolasp98/minion": "workspace:*"`
   - `"openclaw": { "extensions": [...] }` → `"minion": { "extensions": [...] }`

---

## E. Infrastructure Conflicts (5 files — manual merge)

### E1. `package.json` — MANUAL MERGE

| Side         | Changes                                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fork**     | `name: "@nikolasp98/minion"`, `bin: { minion: "minion.mjs" }`, `repository: NikolasP98/minion`, `publishConfig: { access: "public" }`, rebrand all script names |
| **Upstream** | Version bumps, dependency updates, possible new scripts                                                                                                         |

**Strategy**: Keep fork identity fields. Accept upstream dependency/script changes. Bump version after merge.

### E2. `Dockerfile` — KEEP OURS (confirmed)

Upstream stripped ALL tools (sqlite3, jq, ffmpeg, gosu, gogcli, etc.). Fork needs gogcli for Google OAuth.

```bash
git checkout --ours Dockerfile
```

### E3. `.github/workflows/docker-release.yml` — MANUAL MERGE

| Side         | Changes                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------- |
| **Fork**     | DEV branch trigger, `docker-tag` composite action, lowercase image name, arch-specific tags |
| **Upstream** | Concurrency group with `cancel-in-progress: false`                                          |

**Strategy**: Keep all fork additions. Also add upstream's concurrency group.

### E4. `.github/workflows/install-smoke.yml` — MANUAL MERGE

| Side         | Changes                                         |
| ------------ | ----------------------------------------------- |
| **Fork**     | Modifications from CI hardening commit          |
| **Upstream** | Runner change to `blacksmith-4vcpu-ubuntu-2404` |

**Strategy**: Accept upstream runner. Keep fork modifications.

### E5. `vitest.config.ts` — MANUAL MERGE

| Side         | Changes                                                |
| ------------ | ------------------------------------------------------ |
| **Fork**     | Coverage exclusion comments with structured categories |
| **Upstream** | Possible config updates                                |

**Strategy**: Accept upstream config. Re-apply fork's exclusion comments.

---

## F. Source Code Conflicts with Fork Features (13 files — manual merge)

These files have actual fork functionality beyond the rebrand AND upstream changes.

### F1. `src/telegram/bot-native-commands.ts` (337 upstream lines changed)

| Fork commits | Feature                              |
| ------------ | ------------------------------------ |
| `190c5c3aa`  | Package-based install support        |
| `d6180af3c`  | Command registration reliability fix |
| `041e4db24`  | Command registration reliability fix |

**Strategy**: Accept upstream restructure. Re-apply fork's registration reliability fix and install support.

### F2. `src/agents/session-write-lock.ts` (320 upstream lines changed)

| Fork commits | Feature                                 |
| ------------ | --------------------------------------- |
| `16aaed1c9`  | Fix logWarn usage to pass string        |
| `082c4ba22`  | Add parentheses for operator precedence |
| `c717cb678`  | Increase timeout and add diagnostics    |

**Strategy**: Accept upstream changes. Check if fork's fixes are already included upstream. Re-apply if not.

### F3. `src/agents/cli-runner/helpers.ts` (253 upstream lines changed)

| Fork commits | Feature                                 |
| ------------ | --------------------------------------- |
| `0d6d98f5b`  | Consolidate duplicate utility functions |

**Strategy**: Accept upstream. Fork's consolidation may already be upstreamed via #12439.

### F4. `src/infra/outbound/deliver.ts` (147 upstream lines changed)

| Fork commits | Feature                                                   |
| ------------ | --------------------------------------------------------- |
| `0e8bc42a1`  | Consolidate throwIfAborted + fix isCompactionFailureError |

**Strategy**: Accept upstream. Fork's fix may already be upstreamed via #12463.

### F5. `src/plugins/loader.ts` (133 upstream lines changed)

| Fork commits | Feature                                     |
| ------------ | ------------------------------------------- |
| `aef985265`  | Bypass jiti for pre-compiled .js extensions |

**Strategy**: Accept upstream. Re-apply pre-compiled extension bypass if not already upstream.

### F6. `src/gateway/server-startup.ts` (77 upstream lines changed)

| Fork commits | Feature                                       |
| ------------ | --------------------------------------------- |
| `772701361`  | Non-blocking Google OAuth authentication flow |

**Strategy**: Accept upstream. Re-apply OAuth startup hook.

### F7. `src/discord/monitor/message-handler.ts` (72 upstream lines changed)

| Fork commits | Feature                     |
| ------------ | --------------------------- |
| `8b4546b9f`  | Message ledger inbound hook |

**Strategy**: Accept upstream. Re-add message ledger hook integration.

### F8. `src/agents/agent-scope.ts` (57 upstream lines changed)

| Fork commits | Feature                                          |
| ------------ | ------------------------------------------------ |
| `911a1fc3a`  | Relevance gate for keyword-based group responses |

**Strategy**: Accept upstream. Re-apply relevance gate.

### F9. `src/cli/update-cli/shared.ts` + `src/cli/update-cli.ts` (51+43 lines)

| Fork commits | Feature                         |
| ------------ | ------------------------------- |
| `de98d42c1`  | npm-publish workflow references |
| `190c5c3aa`  | Package-based install stamping  |
| `5407a170f`  | pnpm as default package manager |

**Strategy**: Accept upstream. Re-apply fork's package manager and install references.

### F10. `src/config/zod-schema.ts` + `src/config/types.gateway.ts` (29+21 lines)

| Fork commits | Feature                                    |
| ------------ | ------------------------------------------ |
| `8b4546b9f`  | Message ledger config types and Zod schema |

**Strategy**: Accept upstream. Re-add ledger config fields.

### F11. `src/browser/client-fetch.ts` (25 upstream lines changed)

| Fork commits | Feature                            |
| ------------ | ---------------------------------- |
| `8d32b9114`  | Restore native app path references |

**Strategy**: Accept upstream. Verify native paths preserved.

---

## G. Extension Source Conflict (1 file)

### `extensions/msteams/src/store-fs.ts`

**Strategy**: Accept upstream. Check if fork changes are still needed.

---

## H. Documentation & Other Conflicts (4 files)

| File                            | Strategy                                |
| ------------------------------- | --------------------------------------- |
| `CHANGELOG.md`                  | Accept upstream, append fork entries    |
| `README.md`                     | Accept upstream, re-apply fork branding |
| `docs/channels/telegram.md`     | Accept upstream                         |
| `docs/platforms/mac/release.md` | Accept upstream                         |

---

## Pre-Merge Blockers

### 127 Untracked Files

The merge is blocked by 127 untracked local files that upstream wants to create. These include:

- `.openclaw/workspace-state.json`
- `BOOTSTRAP.md`, `HEARTBEAT.md`, `SOUL.md`, `TOOLS.md`
- iOS/macOS new source files (onboarding, gateway, etc.)
- Docs translations (es/, pt-BR/, zh-CN/)

**Resolution before merge**:

```bash
# Option 1: Add them (they'll be overwritten by merge)
git add .openclaw/ BOOTSTRAP.md HEARTBEAT.md SOUL.md TOOLS.md
git add apps/ios/Sources/EventKit/ apps/ios/Sources/Gateway/GatewayConnectionIssue.swift ...
# (or use git add for all blocking files)

# Option 2: Remove them temporarily
rm -rf .openclaw/ BOOTSTRAP.md HEARTBEAT.md SOUL.md TOOLS.md
# Merge will recreate them from upstream
```

---

## Merge Execution Plan

### Step 1: Clear blockers

```bash
# Remove/add the 127 blocking untracked files
git add <blocking-files>  # or rm them
```

### Step 2: Start merge

```bash
git merge mirror -m "Merge upstream changes from mirror"
```

### Step 3: Resolve in order

**3a. Keep-ours (fork infrastructure):**

```bash
git checkout --ours Dockerfile
```

**3b. Accept-theirs (313 pure rebrand + extension source):**

```bash
# For each pure-rebrand conflicted file:
git checkout --theirs <file>
```

**3c. Extension package.json (30 files):**
Accept upstream, then scripted re-apply of scoped names.

**3d. Manual merge (5 infra + 13 source + 4 docs = 22 files):**
File-by-file 3-way merge per strategies above.

### Step 4: Re-apply rebrand

```bash
# Run rebrand script across all accepted-theirs files
# Exclude native app paths from rebrand
```

### Step 5: Regenerate lockfile

```bash
pnpm install
```

### Step 6: Verify

```bash
pnpm build
pnpm test  # or subset
```

### Step 7: Commit and push

```bash
git add .
git commit -m "Merge upstream changes from mirror (1,428 commits)"
git push origin DEV
```

---

## Risk Assessment

| Risk                                           | Level  | Mitigation                                               |
| ---------------------------------------------- | ------ | -------------------------------------------------------- |
| Rebrand script misses patterns                 | Medium | Grep for remaining `openclaw`/`OpenClaw` after script    |
| Rebrand script hits native app paths           | Medium | Exclude `apps/` directory, verify native paths           |
| Fork features break after upstream restructure | Medium | Re-apply features incrementally, test each               |
| pnpm-lock.yaml regeneration issues             | Low    | `pnpm install --force` if needed                         |
| Upstream deleted APIs fork depends on          | Low    | Verified: fork doesn't import any of the 4 deleted files |
