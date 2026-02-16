# Minion Fork Sync Workflow

## Overview

**Purpose**: Sync Minion fork with upstream while preserving custom Docker work

**Strategy**: Merge-based workflow to preserve history and protect custom code

**Branch Flow**: `upstream/main` → `mirror` → `DEV` (→ `main` for production)

**Key Principle**: Mirror tracks upstream; DEV integrates custom work; main is production

## Quick Reference

```bash
# Full sync (upstream → mirror → DEV)
git fetch upstream && \
git checkout mirror && git merge --ff-only upstream/main && git push origin mirror && \
git checkout DEV && git merge mirror && git push origin DEV
```

**Note**: Feature branches and main (production) are not auto-synced. Update them manually when needed.

## Understanding Merge Safety

### Your Custom Code is Protected

**Critical**: Git merge does NOT overwrite your custom code automatically. Here's what happens:

1. **No overlapping changes** (99% of syncs)
   - Upstream changed: `src/gateway/*.ts`, `docs/*.md`
   - You changed: `Dockerfile`, `docker-compose.yml`, `entrypoint.sh`
   - **Result**: Both sets of changes preserved automatically

2. **Conflicts detected** (rare)
   - Upstream changed: `Dockerfile` line 10
   - You changed: `Dockerfile` line 10
   - **Result**: Git stops and asks you to resolve

3. **Same file, different lines**
   - Upstream changed: `Dockerfile` line 10
   - You changed: `Dockerfile` line 50
   - **Result**: Both changes merged in same file

### Why Merge > Cherry-Pick

| Merge                          | Cherry-Pick                                   |
| ------------------------------ | --------------------------------------------- |
| Automatic - brings all commits | Manual - select each commit                   |
| Preserves commit relationships | Creates duplicate commits with different SHAs |
| Idempotent - safe to repeat    | Easy to lose track of what's synced           |
| Self-documenting history       | Tedious and error-prone                       |

## Step-by-Step Workflow

### Phase 1: Fetch Latest Upstream Changes

```bash
# Fetch all branches from upstream (no local changes yet)
git fetch upstream

# Optional: Preview what's new
git log --oneline mirror..upstream/main
```

**Frequency**: Run anytime before syncing (daily, weekly, or as needed)

### Phase 2: Sync Mirror Branch (Clean Mirror)

```bash
# Switch to mirror
git checkout mirror

# Fast-forward merge (no merge commit needed)
git merge --ff-only upstream/main

# Push to your fork
git push origin mirror
```

**Expected Result**: Mirror stays as exact mirror of upstream

**If it fails**: Mirror has diverged from upstream, see Troubleshooting section

### Phase 3: Propagate to DEV

```bash
# Switch to DEV
git checkout DEV

# Merge mirror (which now has upstream changes)
git merge mirror -m "Merge upstream changes from mirror"

# If conflicts occur, resolve them (see Conflict Resolution below)
# Git will NEVER silently overwrite your Docker customizations

# Push to your fork
git push origin DEV
```

**Expected Result**:

- DEV contains all upstream changes + your custom Docker work
- Your Docker files preserved (Dockerfile, docker-compose.yml, entrypoint.sh)
- If conflicts, Git stops and asks you to resolve

**Note**: This is the final automated phase. Feature branches and main (production) are not auto-synced.

### Manual Branch Management

#### Updating Feature Branches (Optional)

#### Creating a Feature Branch

```bash
# Start from latest DEV
git checkout DEV
git pull origin DEV

# Create feature branch
git checkout -b feature/add-xyz
```

#### Working on Feature

```bash
# Make changes, commit as usual
git add <files>
git commit -m "feat: add xyz functionality"

# Push feature branch to origin
git push origin feature/add-xyz
```

#### Keeping Feature Branch Updated

```bash
# If DEV advances while working on feature:
git checkout DEV && git pull origin DEV
git checkout feature/add-xyz
git rebase DEV

# If conflicts, resolve and continue:
git add <resolved-files>
git rebase --continue

# Force-push rebased feature branch
git push origin feature/add-xyz -f
```

**Why Rebase Here**: Keeps feature commits clean and linear before merging to DEV

#### Merging Feature Back to DEV

```bash
# Option 1: Merge commit (preserves feature branch history)
git checkout DEV
git merge --no-ff feature/add-xyz -m "Merge feature: add xyz"
git push origin DEV

# Option 2: Squash merge (single commit for entire feature)
git checkout DEV
git merge --squash feature/add-xyz
git commit -m "feat: add xyz functionality"
git push origin DEV

# Clean up feature branch
git branch -d feature/add-xyz
git push origin --delete feature/add-xyz
```

#### Updating Main / Production (Manual, When Ready)

```bash
# Test DEV thoroughly first!

# Switch to main
git checkout main
git pull origin main

# Merge DEV into main (production release)
git merge DEV -m "Release: promote DEV changes to production"

# Tag the release (optional but recommended)
git tag -a v1.2.3 -m "Production release v1.2.3"

# Push to production
git push origin main
git push origin v1.2.3
```

**Frequency**: Only when DEV is stable and tested, NOT after every upstream sync

## Conflict Resolution

### When Conflicts Occur

Conflicts typically happen in Phase 3 (DEV ← mirror) when both upstream and your fork modified the same lines.

```bash
# After "git merge" reports conflicts:

# 1. See which files have conflicts
git status
# Shows: "both modified: Dockerfile"

# 2. Open conflicting file, look for conflict markers
<<<<<<< HEAD (Your current changes)
FROM node:22-alpine
RUN apk add --no-cache git bash curl
=======
FROM node:20-slim
>>>>>>> mirror (Incoming upstream changes)

# 3. Decide what to keep:
#    Option A: Keep your version (delete markers + upstream version)
FROM node:22-alpine
RUN apk add --no-cache git bash curl

#    Option B: Keep upstream version (delete markers + your version)
FROM node:20-slim

#    Option C: Merge both (combine the best of both)
FROM node:22-alpine
RUN apk add --no-cache git bash curl python3

# 4. Stage resolved file
git add Dockerfile

# 5. Complete the merge
git commit -m "Merge upstream changes from mirror"

# 6. Push
git push origin DEV
```

### Common Conflict Patterns

| File                          | Likelihood | Resolution Strategy                                       |
| ----------------------------- | ---------- | --------------------------------------------------------- |
| `docker-compose.yml`          | Low        | Keep YOUR version (DEV/main specific config)              |
| `Dockerfile`                  | Low        | Keep YOUR optimizations, review upstream security updates |
| `entrypoint.sh`               | Very Low   | Keep YOUR enhanced version                                |
| `docker/preset-enhanced.json` | Zero       | Your custom file, upstream doesn't have it                |
| `src/**/*.ts`                 | Medium     | Accept UPSTREAM changes (core functionality)              |
| `docs/**/*.md`                | Low        | Accept UPSTREAM changes (documentation)                   |
| `package.json`                | Medium     | Merge BOTH (upstream deps + your custom scripts)          |

### Best Practices to Minimize Conflicts

**DO**:

- Keep Docker customizations in Docker-specific files
- Add new files (e.g., `docker/preset-enhanced.json`) instead of modifying existing
- Document custom changes in fork-specific docs
- Use config overrides instead of modifying core files

**DON'T**:

- Modify `src/**/*.ts` unless absolutely necessary
- Change upstream documentation (create fork-specific docs instead)
- Mix custom logic into core Minion files

## Visual Workflow

```
upstream/main (minion/minion)
    │
    │ git fetch upstream
    ↓
mirror (clean mirror)
    │
    │ git merge --ff-only upstream/main
    │ git push origin mirror
    ↓
origin/mirror (your fork)
    │
    │ git checkout DEV
    │ git merge mirror
    │ (resolve conflicts if any - YOUR CODE PROTECTED)
    ↓
DEV (development branch - AUTO-SYNCED)

──────────────────────────────────────────
Manual Branch Management (not auto-synced):
──────────────────────────────────────────

feature/* branches → Rebase or merge from DEV when needed
main branch → Merge from DEV when ready for production
```

## Automation

### One-Command Sync (Git Alias)

Add to `~/.gitconfig`:

```ini
[alias]
    sync-upstream = "!f() { \
        echo '→ Fetching upstream...' && \
        git fetch upstream && \
        echo '→ Syncing mirror branch...' && \
        git checkout mirror && \
        git merge --ff-only upstream/main && \
        git push origin mirror && \
        echo '→ Updating DEV...' && \
        git checkout DEV && \
        git merge mirror -m 'Merge upstream changes from mirror' && \
        git push origin DEV && \
        echo 'Sync complete! DEV is up to date.' && \
        echo 'Feature branches and main (production) are not auto-synced.'; \
    }; f"
```

Then run:

```bash
git sync-upstream
```

**This does**:

- Syncs mirror with upstream
- Updates DEV
- Protects your custom code (stops on conflicts)
- Keeps you on DEV for continued work

**This does NOT**:

- Touch feature branches or main (production)
- Overwrite your code (merge respects both histories)
- Delete anything

## Verification

After each sync cycle, verify:

```bash
# Main matches upstream
git log --oneline mirror..upstream/main  # Should be empty

# DEV contains mirror
git merge-base --is-ancestor mirror DEV && echo "DEV contains mirror"

# View branch structure
git log --oneline --graph --all --decorate -20

# Verify Docker configurations preserved
git diff origin/DEV -- Dockerfile docker-compose.yml entrypoint.sh docker/
```

## Troubleshooting

### "fatal: Not possible to fast-forward" on mirror

**Cause**: Mirror has diverged from upstream (has local commits)

**Solution Options**:

**Option 1: Push local commit to origin** (if commit is valuable)

```bash
git checkout mirror
git push origin mirror
# Next sync will create a merge commit
```

**Option 2: Move commit to DEV** (keep mirror clean)

```bash
# Cherry-pick the commit to DEV (one-time exception)
git checkout DEV
git cherry-pick <commit-hash>
git push origin DEV

# Reset mirror to match upstream
git checkout mirror
git reset --hard upstream/main
git push origin mirror -f
```

**Option 3: Discard the commit** (if not needed)

```bash
git checkout mirror
git reset --hard upstream/main
git push origin mirror -f
```

### Merge conflicts on every sync

**Cause**: Your custom changes overlap with upstream changes in the same files/lines

**Solution**:

- Keep Docker customizations isolated to Docker-related files
- Don't modify core source files unless necessary
- If you must modify core files, document changes for easy re-application
- Consider proposing changes upstream via PR instead of maintaining fork-only modifications

### main and DEV have diverged

**Cause**: Direct commits to main instead of merging from DEV

**Solution**: Always commit to DEV first, then merge to main

**Recovery**:

```bash
# Option 1: Reset main to match DEV (if main changes not needed)
git checkout main
git reset --hard DEV
git push origin main -f

# Option 2: Merge main changes back to DEV first
git checkout DEV
git merge main -m "Merge main divergence back to DEV"
git push origin DEV
# Then reset main
git checkout main
git reset --hard DEV
git push origin main -f
```

### Lost track of what's synced

**Cause**: Cherry-picking or manual selective merges

**Solution**: Stick to the merge-based workflow - it's self-documenting

**Recovery**: Compare branches to understand current state

```bash
# See what DEV has that mirror doesn't
git log mirror..DEV --oneline

# See what main has that DEV doesn't
git log DEV..main --oneline

# See divergence between branches
git log --oneline --graph DEV main mirror
```

## Maintenance Schedule

- **Weekly**: Run full sync cycle to stay current with upstream
- **Before major work**: Sync to ensure working on latest code
- **After upstream releases**: Sync immediately to get bug fixes and features
- **Before PRs to upstream**: Sync to ensure compatibility

## Success Criteria

- Can sync fork with upstream using simple merge commands
- No cherry-picking required for normal operations
- Clear merge history showing sync points
- Custom Docker work preserved across syncs
- Minimal conflicts due to isolated customizations
- Reproducible workflow that can be automated

## Differences from update_minionbot.md

This workflow differs from `.agent/workflows/update_minionbot.md`:

| Feature         | update_minionbot.md | minion-fork-sync.md       |
| --------------- | ------------------- | ------------------------- |
| **Target**      | Minionbot fork      | Minion fork               |
| **Branches**    | main only           | mirror → DEV → main       |
| **Strategy**    | Rebase preferred    | Merge preferred           |
| **Rebuild**     | macOS/Swift focus   | Docker container focus    |
| **Custom Code** | General source      | Docker-specific isolation |

Both workflows serve different purposes and should be maintained separately.
