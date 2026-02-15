---
skill: fork-sync
description: Sync OpenClaw fork with upstream and update all development branches
triggers:
  - sync fork
  - update from upstream
  - sync with upstream
  - update branches
  - fork workflow
---

# Fork Sync Workflow

Comprehensive skill for managing the OpenClaw fork workflow, syncing with upstream, and updating all development branches.

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

### Phase 2: Update DEV Branch

**Goal**: Merge updated mirror into DEV to bring in upstream changes

```bash
git checkout DEV

# Merge updated mirror
git merge mirror -m "Merge upstream changes from mirror"

# Resolve conflicts if any
# Push to origin
git push origin DEV
```

**Expected**: Clean merge or conflicts requiring manual resolution

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
┌─────────────────────────────────────────────────────────────┐
│                  Fork Sync Quick Reference                   │
├─────────────────────────────────────────────────────────────┤
│ 0. Clean mirror (if needed) → git checkout mirror           │
│                                git reset --hard upstream/main│
│                                git push --force-with-lease   │
├─────────────────────────────────────────────────────────────┤
│ 1. Sync mirror             → git checkout mirror             │
│                               git merge --ff-only upstream/main│
│                               git push origin mirror         │
├─────────────────────────────────────────────────────────────┤
│ 2. Update DEV              → git checkout DEV                │
│                               git merge mirror               │
│                               git push origin DEV            │
├─────────────────────────────────────────────────────────────┤
│ Verify:                    → git log mirror..upstream/main   │
│                               (should be empty)              │
├─────────────────────────────────────────────────────────────┤
│ Note: Feature branches and main (production) are manual     │
└─────────────────────────────────────────────────────────────┘
```

## When to Use This Skill

Invoke this skill when:

- "Sync with upstream"
- "Update fork from openclaw/openclaw"
- "Pull latest from upstream"
- "Update all branches"
- "Sync DEV with upstream"
- "Fork workflow" or "fork-sync"
- Before starting major feature work (to start from latest upstream)
- After seeing mirror has diverged from upstream

---

**Skill Version**: 3.0.0
**Last Updated**: 2026-02-15
**Maintained By**: Nikolas P. (NikolasP98)
