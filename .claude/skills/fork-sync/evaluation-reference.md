# Upstream Evaluation Reference

Detailed reference for Phase 1.6 (Systematic Upstream Evaluation). This document is linked from SKILL.md — read it when executing the evaluation workflow.

---

## A. State File Schema

Location: `.claude/skills/fork-sync/state/evaluation.json`

```json
{
  "version": 1,
  "created": "ISO-8601",
  "updated": "ISO-8601",
  "snapshot": {
    "mergeBase": "sha",
    "mirrorHead": "sha",
    "devHead": "sha",
    "upstreamCommitCount": 1428,
    "forkCommitCount": 147
  },
  "cursor": {
    "currentModuleIndex": 5,
    "totalModules": 28,
    "completedModules": 5,
    "totalCommitsEvaluated": 342
  },
  "summary": {
    "accept": 892,
    "skip": 412,
    "defer": 78,
    "review": 46,
    "autoAccepted": 756,
    "autoSkipped": 380,
    "manuallyDecided": 124
  },
  "modules": [
    {
      "id": "src/telegram",
      "status": "completed|pending|in-progress",
      "commitCount": 26,
      "conflictFiles": 31,
      "forkFeatureFiles": 1,
      "decision": "accept|skip|defer|review",
      "notes": "Accept upstream restructure, re-add relevance gate and message ledger hooks",
      "evaluatedAt": "ISO-8601"
    }
  ],
  "forkFeatureIndex": {
    "src/telegram/bot-native-commands.ts": {
      "forkCommits": ["190c5c3aa", "d6180af3c"],
      "feature": "Package-based install + registration reliability",
      "resolution": "accept-upstream-reapply-fork"
    }
  },
  "mergeShoppingList": {
    "keepOurs": ["Dockerfile"],
    "acceptWithRebrand": 313,
    "extensionPackageJson": 30,
    "manualMerge": ["package.json", "ci.yml"],
    "autoAccept": 1966
  }
}
```

### Field Reference

| Field               | Description                                                   |
| ------------------- | ------------------------------------------------------------- |
| `version`           | Schema version (increment on breaking changes)                |
| `snapshot`          | Branch state at initialization — used for resumability checks |
| `cursor`            | Current progress position for resuming mid-evaluation         |
| `summary`           | Aggregate counts across all modules                           |
| `modules[]`         | Per-module evaluation state and decisions                     |
| `forkFeatureIndex`  | Files with actual fork functionality (conflict-prone)         |
| `mergeShoppingList` | Final output — conflict resolution playbook for Phase 2       |

### Module Status Values

- **pending**: Not yet evaluated
- **in-progress**: Currently being evaluated (cursor points here)
- **completed**: Decision made and recorded

### Decision Values

- **accept**: Merge upstream changes (may need rebrand fixup)
- **skip**: Upstream changes irrelevant or harmful to fork
- **defer**: Revisit later (complex interaction with other modules)
- **review**: Needs human attention — couldn't auto-categorize

---

## B. Auto-Categorization Heuristics

Apply tiers in order. Later tiers can override earlier decisions.

### Tier 1 — Commit Message Pattern

| Pattern                                   | Decision          | Reason                             |
| ----------------------------------------- | ----------------- | ---------------------------------- |
| `test:` or only `*.test.ts` files changed | skip              | Test-only, no functional impact    |
| `docs:` or only `docs/` files changed     | skip              | Documentation-only                 |
| `style:`, `chore(release)`, version bumps | skip              | Formatting or release automation   |
| `feat:`, `fix:`                           | review            | Functional changes need evaluation |
| `fix(security)`, `security:`              | accept (priority) | Security fixes always wanted       |
| `Revert "..."`                            | skip              | Reverted changes cancel out        |
| `refactor:`                               | review            | May affect fork code paths         |
| `chore:` with only dependency updates     | accept            | Keep dependencies current          |

### Tier 2 — File Path Overrides

These override Tier 1 decisions based on which files a commit touches:

| Files Touched                                            | Decision | Reason                                           |
| -------------------------------------------------------- | -------- | ------------------------------------------------ |
| Only `apps/ios/`, `apps/macos/`, `apps/android/`         | accept   | Native apps — no fork conflict (not rebranded)   |
| Only upstream-only paths (no fork changes)               | accept   | Clean merge guaranteed                           |
| Only pure-rebrand conflict files (name changes only)     | accept   | Rebrand script handles resolution                |
| Any file in `forkFeatureIndex`                           | review   | Conflict with fork features                      |
| `Dockerfile`, `.github/workflows/*`, root `package.json` | review   | Fork-customized infrastructure                   |
| `extensions/*/package.json`                              | accept   | Rebrand script handles `@nikolasp98/minion` swap |

### Tier 3 — Combination Rules

When Tier 1 and Tier 2 conflict, apply these:

- `test:` commit that also touches non-test files → promote to **review**
- `refactor:` in non-conflict files → downgrade to **accept**
- `chore:` touching only `package.json` + lockfile → **accept**
- `feat:` in upstream-only path → **accept** (no conflict possible)
- Any commit touching 50+ files → **review** (likely major refactor)
- `fix:` in file not in `forkFeatureIndex` → **accept**

### Expected Distribution

For a ~1,400 commit gap:

- **Auto-skip**: ~500 (test-only, docs, style, reverts)
- **Auto-accept**: ~750 (native apps, upstream-only paths, clean deps)
- **Manual review**: ~178 (fork-feature conflicts, infra, complex refactors)
- **Automation rate**: ~87%

---

## C. Module Priority Order

Evaluate modules in this order. High-priority modules contain fork features that may conflict with upstream.

### High Priority (fork features at risk)

1. **infrastructure** — `Dockerfile`, `docker-compose*.yml`, root config files
2. **workflows** — `.github/workflows/*`, `.github/actions/*`
3. **src/agents** — Core agent runtime, pi-embedded runner
4. **src/gateway** — Gateway server, control UI, HTTP endpoints
5. **src/telegram** — Bot commands, message handling, monitor
6. **src/discord** — Monitor, message handler, components
7. **src/plugins** — Hook system, wired hooks
8. **src/config** — Configuration schema, sessions
9. **src/cli** — CLI commands, daemon CLI
10. **src/infra** — Package management, install paths, heartbeat
11. **src/browser** — Browser server, middleware
12. **extensions** — All extension directories (evaluate as group)

### Medium Priority (rebrand overlap only)

13. **src/auto-reply** — Reply flow, commands, directives
14. **src/commands** — Onboarding, status, doctor
15. **src/cron** — Isolated agent, service, scheduling
16. **src/channels** — Channel plugins, allowlists
17. **src/memory** — Embedding manager, sync
18. **src/web** — Web auto-reply, broadcast
19. **src/slack** — Slack monitor, blocks, modals
20. **src/daemon** — Daemon process management

### Low Priority (no conflicts expected)

21. **apps/** — Native iOS, macOS, Android apps
22. **ui/** — Control UI frontend
23. **src/logging** — Logging utilities
24. **src/security** — Security audit, scan paths
25. **src/media** — Media handling
26. **src/shared** — Shared types and utilities
27. **test/** — Test fixtures and helpers
28. **scripts/** — Build and dev scripts
29. **docs/** — Documentation

---

## D. Module Presentation Format

When presenting a module for evaluation, use this format:

```
## Module: src/telegram (26 commits, 31 conflict files)
Conflict risk: HIGH (1 fork feature file)
Priority: #5 of 28

### Fork Features at Risk
- bot-native-commands.ts — Package install + registration fix
  Fork commits: 190c5c3, d6180af
  Upstream: 337 lines changed across 12 commits
  Recommendation: accept upstream, re-apply fork fix after merge

### Auto-Categorized (22 of 26)
- 8 skip (test-only)
- 6 accept (refactor in non-conflict files)
- 5 accept (bug fixes in non-conflict files)
- 3 accept (new features in upstream-only paths)

### Needs Review (4 commits)
1. abc1234 — feat(telegram): restructure bot command handler
   Files: bot.ts, bot-commands.ts (CONFLICT: bot-native-commands.ts)
   Risk: May break fork's package-based registration

2. def5678 — refactor(telegram): migrate to new message pipeline
   Files: monitor.ts, message-handler.ts
   Risk: Fork hooks into old pipeline

3. ...

### Decision Options
[Accept all] — Accept upstream, plan to re-apply fork features post-merge
[Review individually] — Step through each commit needing review
[Defer] — Come back to this module later
[Skip module] — Skip all upstream changes in this module (rare)
```

---

## E. Resumability Protocol

### On Invocation

1. Check if `state/evaluation.json` exists
2. **If exists**: Verify `snapshot.mirrorHead` matches current `mirror` HEAD
   - **Match** → Resume from `cursor.currentModuleIndex`
   - **Mismatch** → Warn user: "Mirror has advanced since last evaluation"
     - Offer: recalculate (incremental update) or start fresh
3. **If not exists** → Run initialization (Steps 1–3 from Phase 1.6)

### Save Points

Save state after each of these events:

- **Initialization complete** (Steps 1–3 finished)
- **Module evaluation complete** (user made decision on a module)
- **Sub-decision made** (individual commit reviewed within a module)
- **Session end** (user stops mid-evaluation)

### State File Operations

```bash
# Check for existing state
STATE_FILE=".claude/skills/fork-sync/state/evaluation.json"
if [ -f "$STATE_FILE" ]; then
  # Read and verify snapshot
  SAVED_MIRROR=$(jq -r '.snapshot.mirrorHead' "$STATE_FILE")
  CURRENT_MIRROR=$(git rev-parse mirror)
  if [ "$SAVED_MIRROR" = "$CURRENT_MIRROR" ]; then
    echo "Resuming evaluation from module $(jq -r '.cursor.currentModuleIndex' "$STATE_FILE")"
  else
    echo "Mirror has changed — state may be stale"
  fi
fi
```

### Invalidation

State becomes invalid when:

- `mirror` HEAD changes (new upstream sync happened)
- User manually modifies evaluation.json
- Schema version doesn't match expected version

On invalidation, offer three options:

1. **Incremental update**: Keep completed module decisions, re-evaluate only new/changed commits
2. **Fresh start**: Discard state, run full initialization
3. **Force resume**: Continue anyway (for minor mirror advances)

---

## F. Fork Feature Index Construction

The fork feature index identifies files where the fork has actual functional changes (not just rebrand renames). This is the key input for conflict risk assessment.

### Build Process

```bash
# Get merge base between mirror and DEV
MERGE_BASE=$(git merge-base mirror DEV)

# List files changed in fork (DEV vs merge-base)
git diff --name-only $MERGE_BASE..DEV

# For each changed file, check if it's a rebrand-only change or functional
git diff $MERGE_BASE..DEV -- <file> | head -40
```

### Classification

For each fork-changed file:

- **Rebrand-only**: Only `openclaw` → `minion` name changes → not a fork feature
- **Config-only**: Only fork-specific config values (ports, tags, names) → low risk
- **Functional**: Actual code logic changes → add to `forkFeatureIndex`

### What to Record

For each entry in `forkFeatureIndex`:

- File path
- Fork commits that modified it (SHAs)
- Short description of the fork feature
- Recommended resolution strategy:
  - `accept-upstream-reapply-fork` — Take upstream changes, manually re-add fork logic
  - `keep-ours` — Fork version is correct, ignore upstream
  - `manual-merge` — Both sides have important changes, merge manually

---

## G. Merge Shopping List Format

The merge shopping list is the final output — a conflict resolution playbook for Phase 2.

### Categories

| Category               | Description                               | Resolution                                     |
| ---------------------- | ----------------------------------------- | ---------------------------------------------- |
| `keepOurs`             | Files where fork version is correct       | `git checkout --ours <file>`                   |
| `acceptWithRebrand`    | Files needing only name substitution      | Accept upstream + run rebrand                  |
| `extensionPackageJson` | Extension package.json files              | Accept upstream + fix `@nikolasp98/minion` dep |
| `manualMerge`          | Files needing careful conflict resolution | Resolve hunk-by-hunk per notes                 |
| `autoAccept`           | Files with no conflict                    | Merge cleanly, no action needed                |

### Export to Markdown

The evaluation generates `UPSTREAM_MERGE_EVALUATION.md` at project root with:

1. Summary statistics
2. Module-by-module decisions
3. Conflict resolution playbook (the shopping list)
4. Known risks and post-merge action items
