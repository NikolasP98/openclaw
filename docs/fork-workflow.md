# Fork Workflow & Branch Management

This document describes the branch naming conventions and cleanup strategies for the OpenClaw fork.

## Branch Structure

```
upstream/main (openclaw/openclaw official)
    ↓ (fast-forward sync)
main (your fork's main, clean mirror of upstream)
    ↓ (periodic updates to feature branches)
feature/docker-workflow-automation (persistent custom feature)
nikolas/custom-setup (persistent custom feature)
    ↓ (merge into)
DEV (staging: main + all persistent features + temp features)
    ↓ (after testing)
PRD (production: validated DEV state)
```

## Remotes

```
origin   → git@github.com:NikolasP98/openclaw.git (your fork)
upstream → git@github.com:openclaw/openclaw.git (official repo)
```

## Branch Naming Conventions

### The `main` Branch

**Keep the name `main`** - this is standard practice for forks.

**Why not rename to `upstream` or `fork`?**
- ✅ Industry Standard: 99% of forks use `main`
- ✅ Tool Compatibility: GitHub, CI/CD tools expect `main`
- ✅ Clear Semantics: The remote names already provide distinction
- ❌ `upstream` would collide with the remote name
- ❌ Non-standard naming breaks developer expectations

**Terminology:**
- `upstream/main` = Official OpenClaw main branch
- `origin/main` = Your fork's main branch (mirrors upstream)
- `main` (local) = Your working copy (tracks origin/main)

### Feature Branch Lifecycle

**Persistent Feature Branches** (KEEP after merging):
- Long-term fork customizations (e.g., `feature/docker-workflow-automation`)
- Features you'll maintain separately from upstream
- Personal infrastructure changes
- Features that might need re-merging to new branches

**Examples:** `feature/docker-workflow-automation`, `nikolas/custom-setup`

**Temporary Feature Branches** (DELETE after merging to PRD):
- One-off bug fixes
- Features that will be upstreamed soon
- Experimental work
- Short-term feature work

**Deletion commands:**
```bash
git branch -d feature/temporary-feature           # Delete local
git push origin --delete feature/temporary-feature # Delete remote
```

## Syncing Workflow

### Update Main from Upstream

```bash
# Update your local main
git checkout main
git fetch upstream
git merge --ff-only upstream/main
git push origin main
```

**If fast-forward fails** (main has diverged):
```bash
git reset --hard upstream/main
git push origin main --force-with-lease
```

### Update Persistent Feature Branches

**Recommended frequency:**
- Active development: weekly or bi-weekly
- Maintenance: monthly
- Before major releases
- When relevant upstream changes occur

**Workflow:**
```bash
# 1. Update main first (see above)

# 2. Update feature branch
git checkout feature/docker-workflow-automation
git merge main

# 3. If no conflicts
git push origin feature/docker-workflow-automation

# 4. If conflicts occur (see conflict resolution below)
```

### Re-merge into DEV/PRD

After updating a persistent feature branch:

```bash
# Update DEV
git checkout DEV
git merge main                              # Get latest main
git merge feature/docker-workflow-automation # Merge updated feature
git push origin DEV

# Update PRD (after testing DEV)
git checkout PRD
git merge DEV
git push origin PRD
```

## Conflict Resolution

### When Conflicts Occur

Conflicts happen when:
- Upstream modified the same files/lines you customized
- Upstream refactored code your feature depends on
- Files were moved/deleted upstream but modified in your branch

### Resolution Strategy

#### Step 1: Assess the Conflict

```bash
git status  # Shows conflicted files
```

Output:
```
Unmerged paths:
  both modified:   src/some-file.ts
```

#### Step 2: Analyze Conflict Markers

```typescript
<<<<<<< HEAD
// Your feature branch code
your code here
=======
// Upstream main code
upstream code here
>>>>>>> main
```

#### Step 3: Resolve by Conflict Type

**Type A: Simple Line Conflicts**
- Your feature changed the same lines upstream touched
- **Resolution:** Keep your changes, integrate necessary upstream updates

Example:
```typescript
// Before:
<<<<<<< HEAD
await runDockerWorkflow(config);
=======
await runWorkflow(config, options);
>>>>>>> main

// After (combined):
await runDockerWorkflow(config, options);
```

**Type B: Structural Refactors**
- Upstream refactored/moved code
- **Resolution:** Adapt your feature to new structure

Example:
```typescript
// Before:
<<<<<<< HEAD
import { oldFunction } from './old-location';
=======
import { newFunction } from './new-structure/location';
>>>>>>> main

// After:
import { newFunction } from './new-structure/location';
// Then update feature code to use newFunction
```

**Type C: Feature Overlap**
- Upstream added similar functionality
- **Resolution:** Decide if your customization is still needed

Options:
1. Keep your version if it has unique functionality
2. Adopt upstream version if it's better/more general
3. Merge both if they serve different purposes

**Type D: Deleted/Moved Files**

```bash
# If file no longer needed
git rm src/old-file.ts

# If still needed, move to new location
git mv src/old-file.ts src/new-location.ts
# Then update imports in your feature code
```

#### Step 4: Mark Resolved and Complete

```bash
# After fixing conflicts in each file
git add path/to/resolved-file.ts

# Check remaining conflicts
git status

# Complete the merge
git commit

# Push updated branch
git push origin feature/docker-workflow-automation
```

#### Step 5: Test Your Feature

```bash
pnpm test
pnpm openclaw <your-feature-command>
```

### Emergency Conflict Resolution

**Option 1: Abort and Rebase**
```bash
git merge --abort
git rebase main
# Resolve conflicts one commit at a time
git rebase --continue
```

**Option 2: Recreate the Feature Branch**
```bash
# Backup current branch
git branch feature/docker-workflow-automation-backup

# Create fresh branch from main
git checkout main
git checkout -b feature/docker-workflow-automation-new

# Review what changed
git diff main feature/docker-workflow-automation-backup

# Manually reapply customizations

# Replace old branch
git branch -D feature/docker-workflow-automation
git branch -m feature/docker-workflow-automation-new feature/docker-workflow-automation
git push origin feature/docker-workflow-automation --force-with-lease
```

**Option 3: Cherry-pick Commits**
```bash
git checkout main
git checkout -b feature/docker-workflow-automation-new

# Find commits to preserve
git log feature/docker-workflow-automation

# Cherry-pick them
git cherry-pick <commit-hash>

# Replace old branch when done
```

## Conflict Prevention Best Practices

### 1. Keep Feature Branches Focused
- Smaller branches = fewer conflicts
- Don't modify core files unless necessary
- Isolate customizations in separate files

### 2. Sync Regularly
- Weekly syncs = small, manageable conflicts
- Waiting months = massive, complex conflicts

### 3. Monitor Upstream Changes
- Watch the openclaw/openclaw repository
- Review changelogs for breaking changes
- Sync proactively when relevant changes land

### 4. Document Customizations

Add comments explaining WHY you made changes:
```typescript
// CUSTOM: Added Docker workflow automation for deployment pipeline
// See: feature/docker-workflow-automation branch
// Do not remove - required for CI/CD
```

This helps during conflict resolution.

## Complete Example Walkthrough

**Scenario:** Monthly sync of `feature/docker-workflow-automation`

```bash
# 1. Update main from upstream
git checkout main
git fetch upstream
git merge --ff-only upstream/main
git push origin main

# 2. Switch to feature branch and merge
git checkout feature/docker-workflow-automation
git merge main

# 3. If conflicts occur
git status
# Unmerged paths:
#   both modified:   src/docker-workflow.ts

# 4. Resolve conflicts in files
# (edit src/docker-workflow.ts to resolve conflicts)

# 5. Mark as resolved
git add src/docker-workflow.ts

# 6. Complete the merge
git commit -m "Merge main into feature/docker-workflow-automation"

# 7. Test the feature
pnpm test
pnpm openclaw docker-workflow --help

# 8. Push updated branch
git push origin feature/docker-workflow-automation

# 9. Update DEV with refreshed feature
git checkout DEV
git merge main
git merge feature/docker-workflow-automation
git push origin DEV
```

## Quick Reference

### Standard Sync (No Conflicts)
```bash
# One-liner for main update
git checkout main && git fetch upstream && git merge --ff-only upstream/main && git push origin main

# One-liner for feature update
git checkout feature/your-feature && git merge main && git push origin feature/your-feature
```

### Conflict Commands
```bash
git status                 # See conflicted files
git diff                   # See conflict details
git add <resolved-file>    # Mark as resolved
git commit                 # Complete merge
```

### Abort Commands
```bash
git merge --abort          # Cancel merge
git rebase --abort         # Cancel rebase
```

## Current Branch Status

**No changes needed** - your current setup already follows best practices:

1. ✅ `main` is the correct name (not `upstream` or `fork`)
2. ✅ `feature/docker-workflow-automation` kept as persistent feature
3. ✅ `nikolas/custom-setup` kept as persistent feature
4. ✅ Clean, maintainable workflow

**Going forward:** Delete temporary feature branches after they're merged to PRD, but keep persistent customization branches.
