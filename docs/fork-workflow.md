# Fork Workflow & Branch Management

This document describes the branch naming conventions and cleanup strategies for the Minion fork.

## Branch Structure

```
upstream/main (minion/minion official)
    ↓ (fast-forward sync - automated)
mirror (clean mirror of upstream - NO custom commits)
    ↓ (automated sync)
DEV (integration: mirror + all custom work)
    ↓ (manual merge when ready)
main (production - deployed to servers, Docker tag: prd)

───────────────────────────────────────────
Manual branch management (not auto-synced):
───────────────────────────────────────────
feature/* branches → Update by rebasing/merging from DEV
```

**Note**: The fork-sync skill auto-syncs `mirror` and `DEV`. Feature branches and main (production) are managed manually when needed.

## Remotes

```
origin   → git@github.com:NikolasP98/minion.git (your fork)
upstream → git@github.com:minion/minion.git (official repo)
```

## Branch Naming Conventions

### The `mirror` Branch

**Purpose**: Clean mirror of upstream/main. Never contains custom commits.

**Terminology:**

- `upstream/main` = Official Minion main branch
- `origin/mirror` = Your fork's mirror branch (tracks upstream)
- `mirror` (local) = Your working copy (tracks origin/mirror)

### The `main` Branch

**Purpose**: Production branch. Deployed to servers, builds Docker `:prd` tag.

**GitHub default branch**: `main` — makes semantic sense as the primary production branch.

### Feature Branch Lifecycle

**Persistent Feature Branches** (KEEP after merging):

- Long-term fork customizations (e.g., `feature/docker-workflow-automation`)
- Features you'll maintain separately from upstream
- Personal infrastructure changes
- Features that might need re-merging to new branches

**Examples:** `feature/docker-workflow-automation`, `nikolas/custom-setup`

**Temporary Feature Branches** (DELETE after merging to main):

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

### Update Mirror from Upstream

```bash
# Update your local mirror
git checkout mirror
git fetch upstream
git merge --ff-only upstream/main
git push origin mirror
```

**If fast-forward fails** (mirror has diverged):

```bash
git reset --hard upstream/main
git push origin mirror --force-with-lease
```

### Update Persistent Feature Branches

**Recommended frequency:**

- Active development: weekly or bi-weekly
- Maintenance: monthly
- Before major releases
- When relevant upstream changes occur

**Workflow:**

```bash
# 1. Update mirror first (see above)

# 2. Update feature branch
git checkout feature/docker-workflow-automation
git merge DEV

# 3. If no conflicts
git push origin feature/docker-workflow-automation

# 4. If conflicts occur (see conflict resolution below)
```

### Re-merge into DEV/main

After updating a persistent feature branch:

```bash
# Update DEV
git checkout DEV
git merge mirror                              # Get latest upstream
git merge feature/docker-workflow-automation   # Merge updated feature
git push origin DEV

# Update main (after testing DEV)
git checkout main
git merge DEV
git push origin main
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
// Upstream mirror code
upstream code here
>>>>>>> mirror
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
>>>>>>> mirror

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
>>>>>>> mirror

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
pnpm minion <your-feature-command>
```

### Emergency Conflict Resolution

**Option 1: Abort and Rebase**

```bash
git merge --abort
git rebase DEV
# Resolve conflicts one commit at a time
git rebase --continue
```

**Option 2: Recreate the Feature Branch**

```bash
# Backup current branch
git branch feature/docker-workflow-automation-backup

# Create fresh branch from DEV
git checkout DEV
git checkout -b feature/docker-workflow-automation-new

# Review what changed
git diff DEV feature/docker-workflow-automation-backup

# Manually reapply customizations

# Replace old branch
git branch -D feature/docker-workflow-automation
git branch -m feature/docker-workflow-automation-new feature/docker-workflow-automation
git push origin feature/docker-workflow-automation --force-with-lease
```

**Option 3: Cherry-pick Commits**

```bash
git checkout DEV
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

- Watch the minion/minion repository
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
# 1. Update mirror from upstream
git checkout mirror
git fetch upstream
git merge --ff-only upstream/main
git push origin mirror

# 2. Switch to feature branch and merge
git checkout feature/docker-workflow-automation
git merge DEV

# 3. If conflicts occur
git status
# Unmerged paths:
#   both modified:   src/docker-workflow.ts

# 4. Resolve conflicts in files
# (edit src/docker-workflow.ts to resolve conflicts)

# 5. Mark as resolved
git add src/docker-workflow.ts

# 6. Complete the merge
git commit -m "Merge DEV into feature/docker-workflow-automation"

# 7. Test the feature
pnpm test
pnpm minion docker-workflow --help

# 8. Push updated branch
git push origin feature/docker-workflow-automation

# 9. Update DEV with refreshed feature
git checkout DEV
git merge mirror
git merge feature/docker-workflow-automation
git push origin DEV
```

## Quick Reference

### Standard Sync (No Conflicts)

```bash
# One-liner for mirror update
git checkout mirror && git fetch upstream && git merge --ff-only upstream/main && git push origin mirror

# One-liner for feature update
git checkout feature/your-feature && git merge DEV && git push origin feature/your-feature
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

1. `mirror` is the clean upstream mirror
2. `DEV` is the integration branch
3. `main` is the production branch
4. Feature branches kept as persistent customizations

**Going forward:** Delete temporary feature branches after they're merged to main, but keep persistent customization branches.
