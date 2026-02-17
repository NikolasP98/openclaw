---
skill: fork-sync
description: Sync Minion fork with upstream and update all development branches
triggers:
  - sync fork
  - update from upstream
  - sync with upstream
  - update branches
  - fork workflow
  - evaluate upstream
  - upstream evaluation
  - review upstream commits
  - resume evaluation
---

# Fork Sync Workflow

Comprehensive skill for managing the Minion fork workflow, syncing with upstream, and updating all development branches.

## Critical Principle: Mirror is a Clean Mirror

**IMPORTANT**: The `mirror` branch must ALWAYS be a clean mirror of `upstream/main`. It should NEVER contain custom commits.

### Workflow for Custom Changes

When `mirror` has diverged from upstream (contains custom commits):

1. **Verify custom commits are on DEV/main**: Check that all custom work exists on development branches
2. **Reset mirror to upstream**: `git reset --hard upstream/main`
3. **Force push mirror**: `git push --force-with-lease origin mirror`
4. **Custom work remains safe**: All custom commits stay on DEV/main/feature branches

### Detection and Resolution

```bash
# Check if mirror has diverged
git fetch upstream
git log --oneline upstream/main..mirror

# If output shows commits (mirror has diverged):
# 1. Verify commits are on DEV/main
git log --oneline DEV | head -20
git log --oneline main | head -20

# 2. Reset mirror to upstream
git checkout mirror
git reset --hard upstream/main
git push --force-with-lease origin mirror
```

## Branch Structure

This fork maintains a simplified branch hierarchy:

```
upstream/main (source of truth)
    ↓
mirror (clean mirror - NO custom commits)
    ↓
DEV (integration branch: mirror + all custom work)
    ↓
main (production - deployed to servers, Docker tag: prd)
```

### Branch Purposes

- **mirror**: Clean mirror of upstream/main, NEVER contains custom work
- **DEV**: Integration branch containing all custom features and work
- **main**: Production branch, merge from DEV when ready for deployment
- **Feature branches** (manual): Update manually by rebasing or merging from DEV

## Core Workflow

### Phase 0: Clean Mirror (if needed)

**Goal**: Ensure mirror is a clean mirror of upstream

```bash
# Check if mirror has diverged
git checkout mirror
git fetch upstream
git log --oneline upstream/main..mirror

# If commits shown, mirror has diverged - fix it:
# 1. Verify custom commits exist on DEV/main
git log --oneline DEV | grep "CustomCommit"
git log --oneline main | grep "CustomCommit"

# 2. Reset mirror to upstream
git reset --hard upstream/main
git push --force-with-lease origin mirror
```

**When to run**: Any time mirror has custom commits (detected by divergence check)

### Phase 1: Sync Mirror with Upstream

**Goal**: Update local mirror to match upstream/main

```bash
# Fetch latest from upstream
git fetch upstream

# Switch to mirror (should already be clean)
git checkout mirror

# Fast-forward merge upstream changes (should succeed now)
git merge --ff-only upstream/main

# Push to fork
git push origin mirror
```

**Expected**: Fast-forward merge, no conflicts (since mirror is clean mirror)

### Phase 1.5: Pre-Merge Evaluation

**Goal**: Analyze upstream changes before merging to understand impact and plan conflict resolution

```bash
# Compare mirror (upstream) with main to see what changed
git diff main..mirror --stat | head -50
git log --oneline main..mirror --no-merges | head -30

# Generate per-file change analysis
git diff main..mirror --name-status | sort
```

**Evaluation Process**:

1. **Categorize changes by type**:
   - Core infrastructure (package.json, workflows, build config)
   - New features (new files/directories)
   - Refactors (modified existing files)
   - Deletions (removed files - check if fork depends on them)
   - Documentation updates

2. **For each significant change, evaluate**:
   - **Worth merging?** Does this fix bugs, add useful features, or improve architecture?
   - **Breaking changes?** Does upstream remove/change APIs that fork code depends on?
   - **Conflicts with fork features?** Does upstream implement something we already have differently?
   - **Dependencies?** Do new features require config changes or have dependencies on other changes?

3. **Identify high-risk files**:
   - Files modified by both upstream and fork (will conflict)
   - Core files like package.json, tsconfig.json, workflow files
   - Files the fork heavily customized (banner.ts, rebrand-related files)

4. **Plan merge strategy**:
   - **Accept wholesale**: Upstream changes that don't conflict (most files)
   - **Manual merge**: Files with conflicts - plan which hunks to keep from each side
   - **Reject**: Upstream changes that break fork features (rare - document why)
   - **Adapt after merge**: Fork features that need updates to work with upstream changes

5. **Document evaluation**:
   Create a mental (or written) map of:
   - Major upstream features being merged
   - Expected conflicts and resolution strategy
   - Files that will need post-merge fixes
   - Tests that might break and need updates

**Expected time**: 5-10 minutes for review

**Output**: Clear understanding of what's changing and plan for Phase 2 merge

### Phase 1.6: Systematic Upstream Evaluation

**When to use**: Gap exceeds ~50 commits, or a bulk merge produced too many conflicts to resolve in one session.

**Goal**: Build a module-by-module merge shopping list — a conflict resolution playbook that guides Phase 2.

**Core principle**: Full merge (`git merge mirror`) remains the integration strategy. The evaluation produces a plan for **how to resolve each conflict**, not which commits to cherry-pick.

**State file**: `.claude/skills/fork-sync/state/evaluation.json`
**Reference**: See `evaluation-reference.md` for detailed heuristics, schema, and module presentation format.

#### Resumability

On invocation, check for existing state:

1. If `state/evaluation.json` exists and `snapshot.mirrorHead` matches current `mirror` HEAD → **resume** from `cursor.currentModuleIndex`
2. If state exists but mirror has advanced → warn user, offer incremental update or fresh start
3. If no state file → run initialization (Steps 1–3)

#### Step 1: Initialize

Snapshot current branch state and build the commit inventory.

```bash
# Record snapshot
MERGE_BASE=$(git merge-base mirror DEV)
MIRROR_HEAD=$(git rev-parse mirror)
DEV_HEAD=$(git rev-parse DEV)
UPSTREAM_COUNT=$(git rev-list --count $MERGE_BASE..mirror)
FORK_COUNT=$(git rev-list --count $MERGE_BASE..DEV)

# Build full commit list grouped by module (src/ subdirectory)
git log --oneline --name-only $MERGE_BASE..mirror
```

#### Step 2: Build Fork Feature Index

Identify which files have actual fork functionality (not just rebrand renames). This determines conflict risk per module.

```bash
# Files changed in fork
git diff --name-only $MERGE_BASE..DEV

# For each: classify as rebrand-only, config-only, or functional
git diff $MERGE_BASE..DEV -- <file>
```

Record functional changes in `forkFeatureIndex` with fork commit SHAs, feature description, and recommended resolution.

#### Step 3: Auto-Categorize

Apply heuristic tiers (see `evaluation-reference.md` Section B) to tag each commit:

- **Tier 1** — Commit message patterns (test/docs/style → skip, feat/fix → review, security → accept)
- **Tier 2** — File path overrides (native apps → accept, fork-feature files → review)
- **Tier 3** — Combination rules (resolve Tier 1/2 conflicts)

Expected: ~87% of commits auto-categorized, ~13% need manual review.

#### Step 4: Interactive Module Evaluation

Present each module to the user in priority order (see `evaluation-reference.md` Section C). For each module show:

- Commit count and conflict file count
- Fork features at risk (from `forkFeatureIndex`)
- Auto-categorization breakdown
- Commits needing manual review

User decides per module: **Accept all** | **Review individually** | **Defer** | **Skip module**

Save state after each module decision. This step is **resumable** — the user can stop and resume across sessions.

#### Step 5: Generate Merge Plan

After all modules are evaluated, compile the merge shopping list:

- **keepOurs**: Files where fork version wins
- **acceptWithRebrand**: Files needing only name substitution after merge
- **extensionPackageJson**: Accept upstream + fix `@nikolasp98/minion` dep
- **manualMerge**: Files needing hunk-by-hunk resolution (with notes)
- **autoAccept**: Files that merge cleanly

Export to `UPSTREAM_MERGE_EVALUATION.md` at project root. This document becomes the playbook for Phase 2.

**Expected time**: 15–30 minutes for first run (initialization + high-priority modules), 5–10 minutes per resumed session

### Phase 2: Update DEV Branch

**Goal**: Merge updated mirror into DEV using the strategy from Phase 1.5 evaluation

```bash
git checkout DEV

# Merge updated mirror
git merge mirror -m "Merge upstream changes from mirror"
```

**If conflicts occur**: Use feature-by-feature resolution strategy

1. **Triage conflicts by category**:

   ```bash
   # List all conflicts
   git status --short | grep "^UU\|^DU\|^UD\|^AA\|^AU\|^UA"

   # Group by type
   # - Package files (package.json, pnpm-lock.yaml)
   # - Config files (tsconfig, workflows, docker)
   # - Source code (src/, extensions/)
   # - Tests (*.test.ts)
   # - Documentation (docs/, *.md)
   ```

2. **Resolve systematically feature-by-feature**:
   - **Start with infrastructure**: package.json, workflows, build config
     - For package.json: accept upstream versions, keep fork-specific dependencies
     - For workflows: upstream is source of truth unless we added custom steps

   - **Then core features**: Process related files together
     - If upstream refactored auth → resolve all auth-related conflicts together
     - If upstream added new tool → review entire tool implementation
     - Keep fork features that don't conflict, adapt those that do

   - **Handle deletions carefully**:
     - Files deleted upstream but modified in fork (UD/DU conflicts)
     - Check if fork actually uses them: `git log --oneline -- <file>`
     - If fork changes were already upstreamed differently → accept deletion
     - If fork still needs the file → keep it (but verify it still works)

   - **Update tests last**: After source changes are resolved
     - Accept upstream test changes unless they break fork features
     - Update fork tests to match new upstream patterns

3. **Validate after each category**:

   ```bash
   # After resolving a group of files
   git add <resolved-files>
   pnpm build  # Quick smoke test
   ```

4. **Complete merge**:
   ```bash
   git add .  # Stage all resolutions
   git commit  # Use the merge commit message
   git push origin DEV
   ```

**Expected**: Systematic conflict resolution, not all-at-once

**Note**: This is the final automated phase. Feature branches and main (production) are not auto-synced.

## Safety Checks

### Pre-Sync Checklist

Before starting the sync workflow:

- [ ] Working directory is clean (`git status`)
- [ ] No uncommitted changes that could conflict
- [ ] WIP changes stashed or committed (`git stash` if needed) — avoids partial-staging complexity during sync
- [ ] Upstream remote is configured (`git remote -v | grep upstream`)
- [ ] Latest upstream fetched (`git fetch upstream`)
- [ ] Mirror is clean mirror (no divergence from upstream)

### Verification Commands

After completing sync:

```bash
# Verify mirror matches upstream
git log --oneline mirror..upstream/main  # Should be empty

# Verify branch relationships
git log --oneline --graph --all --decorate -20

# Verify DEV contains mirror's commits
git merge-base --is-ancestor mirror DEV && echo "✓ DEV contains mirror" || echo "✗ DEV missing mirror commits"
```

### Post-Sync Checklist

- [ ] `mirror` matches `upstream/main` (no divergence)
- [ ] `mirror` pushed to `origin/mirror`
- [ ] `DEV` merged mirror successfully
- [ ] `DEV` pushed to remote
- [ ] Docker workflows still functional (optional: verify builds)

**Note**: Feature branches and main (production) are not synced automatically. Update them manually when needed.

## Conflict Resolution

### Mirror Has Custom Commits

**Problem**: `git merge --ff-only upstream/main` fails with "Not possible to fast-forward"

**Root Cause**: Mirror contains custom commits (violates clean mirror principle)

**Solution**:

1. Verify custom commits exist on DEV/main: `git log --oneline DEV | head`
2. Reset mirror to upstream: `git reset --hard upstream/main`
3. Force push: `git push --force-with-lease origin mirror`
4. Continue normal workflow (merge mirror → DEV)

### Merge Conflicts in DEV

If conflicts occur when merging mirror into DEV:

1. **Identify conflicts**: `git status` shows conflicted files
2. **Common conflict areas**:
   - Docker configurations (if upstream changed docker-compose.yml)
   - Workflow files (if upstream changed .github/workflows/\*)
   - Core files modified by both upstream and custom work

3. **Evaluate upstream vs fork for each conflict**:

   Do NOT default to keeping fork changes. For each conflicted hunk, ask:
   - **Is the upstream change an architectural improvement?** (e.g. new type field, refactored API, better pattern) — If yes, adopt upstream and adapt fork changes to fit the new structure.
   - **Does upstream solve the same problem differently?** — Compare both approaches. The upstream solution may be more robust, better tested, or aligned with the project's direction.
   - **Is the fork change purely additive?** (e.g. new config field, new import) — If yes, keep both: accept upstream's changes AND add the fork-specific additions.
   - **Are they independent changes to the same region?** — Keep both, adjusting whitespace/ordering as needed.

   **Rule of thumb**: Upstream is the source of truth for architecture. Fork changes should layer on top of upstream, not override it. When in doubt, adopt upstream and re-apply fork additions.

4. **Complete merge**:
   ```bash
   git add <resolved-files>
   git commit -m "Merge upstream changes, resolve conflicts"
   git push origin DEV
   ```

### Abort/Rollback

If issues occur during merge:

```bash
# Abort current merge
git merge --abort

# Reset to previous state
git reflog  # Find previous commit
git reset --hard HEAD@{1}

# Or restore from remote
git reset --hard origin/<branch-name>
```

## Common Scenarios

### Scenario 1: Regular Upstream Sync (Weekly/Bi-weekly)

When upstream has new commits and you want to pull them in:

1. **Phase 0**: Check if mirror is clean (should be)
2. **Phase 1**: Merge upstream/main → mirror (fast-forward)
3. **Phase 2**: Merge mirror → DEV
4. **Time**: ~3-5 minutes

**Note**: Feature branches and main (production) are not auto-synced. Update manually when needed.

### Scenario 2: Mirror Has Diverged

When mirror accidentally contains custom commits:

1. **Phase 0**: Verify commits on DEV/main, reset mirror to upstream
2. Continue with normal workflow
3. **Time**: ~2-3 minutes extra

### Scenario 3: Emergency Hotfix from Upstream

When upstream has a critical fix you need immediately:

1. Sync mirror (fast-forward)
2. Cherry-pick to DEV if urgent: `git cherry-pick <commit-sha>`
3. Or run full workflow if you have time

## Quick Sync Script

For routine syncs (assumes mirror is already clean):

```bash
#!/bin/bash
# Quick sync script

set -e  # Exit on error

echo "🔄 Starting fork sync workflow..."

# Fetch upstream
git fetch upstream

# Phase 1: Sync mirror
echo "📥 Phase 1: Syncing mirror with upstream..."
git checkout mirror
git merge --ff-only upstream/main
git push origin mirror

# Phase 2: Update DEV
echo "🔧 Phase 2: Updating DEV branch..."
git checkout DEV
git merge mirror -m "Merge upstream changes from mirror"
git push origin DEV

echo "✅ Fork sync complete!"
echo "💡 Feature branches and main (production) are not auto-synced. Update them manually when needed."
git log --oneline --graph --all --decorate -10
```

## Best Practices

1. **Keep mirror clean**: NEVER commit custom work to mirror
2. **All custom work on DEV**: Commit custom changes to DEV or feature branches
3. **Sync regularly**: Weekly or bi-weekly to avoid large merge conflicts
4. **Clean working directory**: Always start with `git status` showing clean
5. **Stash before sync**: Commit or stash all WIP before starting — avoids partial-staging headaches and stash/pop friction during branch switches
6. **Review upstream changes**: Use `git log mirror..upstream/main` before merging
7. **Test after sync**: Verify Docker images build successfully
8. **DEV before main**: Always test in DEV before merging to main (production)

## Troubleshooting

### "fatal: Not possible to fast-forward"

**Cause**: Mirror has custom commits (diverged from upstream)

**Fix**: Run Phase 0 (Clean Mirror) first

### "error: Your local changes would be overwritten"

**Cause**: Uncommitted changes in working directory

**Fix**:

```bash
git status  # Review changes
git stash   # Temporarily save changes
# Run sync workflow
git stash pop  # Restore changes after sync
```

### "Updates were rejected because the remote contains work"

**Cause**: Remote branch has commits not in local branch

**Fix**:

```bash
git pull --rebase origin <branch-name>
# Resolve conflicts if any
git push origin <branch-name>
```

## Quick Reference Card

```
┌──────────────────────────────────────────────────────────────────┐
│                  Fork Sync Quick Reference                       │
├──────────────────────────────────────────────────────────────────┤
│ 0. Clean mirror (if needed) → git checkout mirror               │
│                                git reset --hard upstream/main    │
│                                git push --force-with-lease       │
├──────────────────────────────────────────────────────────────────┤
│ 1. Sync mirror              → git checkout mirror               │
│                                git merge --ff-only upstream/main │
│                                git push origin mirror            │
├──────────────────────────────────────────────────────────────────┤
│ 1.5. Pre-merge evaluation   → git diff main..mirror --stat      │
│                                Review changes per-file           │
│                                Plan conflict resolution strategy │
├──────────────────────────────────────────────────────────────────┤
│ 1.6. Systematic evaluation  → "evaluate upstream" (resumable)   │
│      (large gaps only)        Module-by-module categorization    │
│                                Builds merge shopping list        │
│                                See evaluation-reference.md       │
├──────────────────────────────────────────────────────────────────┤
│ 2. Update DEV               → git checkout DEV                  │
│                                git merge mirror                  │
│                                Resolve conflicts feature-by-     │
│                                feature (not all-at-once)         │
│                                git push origin DEV               │
├──────────────────────────────────────────────────────────────────┤
│ Verify:                     → git log mirror..upstream/main     │
│                                (should be empty)                 │
├──────────────────────────────────────────────────────────────────┤
│ Note: Feature branches and main (production) are manual         │
└──────────────────────────────────────────────────────────────────┘
```

## When to Use This Skill

Invoke this skill when:

- "Sync with upstream"
- "Update fork from minion/minion"
- "Pull latest from upstream"
- "Update all branches"
- "Sync DEV with upstream"
- "Fork workflow" or "fork-sync"
- "Evaluate upstream" or "resume evaluation" (Phase 1.6)
- Before starting major feature work (to start from latest upstream)
- After seeing mirror has diverged from upstream
- When a bulk merge produces too many conflicts (triggers Phase 1.6)

---

**Skill Version**: 4.0.0
**Last Updated**: 2026-02-16
**Maintained By**: Nikolas P. (NikolasP98)
