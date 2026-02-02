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

## Branch Structure

This fork maintains a specific branch hierarchy:

```
upstream/main (source of truth)
    ↓
main (local copy of upstream)
    ↓
    ├─→ feature/docker-workflow-automation (Docker CI/CD workflows)
    ├─→ nikolas/custom-setup (Personal docker-compose customizations)
    ↓
DEV (integration branch: main + all feature branches)
    ↓
PRD (production-ready branch: mirrors DEV after validation)
```

### Branch Purposes

- **main**: Clean mirror of upstream/main, never contains custom work
- **DEV**: Integration branch containing all feature work, used for testing
- **PRD**: Production-ready branch, mirrors DEV after validation
- **feature/docker-workflow-automation**: Docker publishing workflows for DEV/PRD
- **nikolas/custom-setup**: Personal docker-compose configuration

## Reference Documentation

Full workflow details: `docs/fork-workflow.md`

## Core Workflow

### Phase 1: Sync Main with Upstream

**Goal**: Update local main to match upstream/main

```bash
# Ensure clean working directory
git status

# Fetch latest from upstream (if not already done)
git fetch upstream

# Switch to main
git checkout main

# Fast-forward merge upstream changes
git merge --ff-only upstream/main

# Push to fork
git push origin main
```

**Expected**: Fast-forward merge, no conflicts

### Phase 2: Update Feature Branches

**Goal**: Merge updated main into each feature branch

#### Update feature/docker-workflow-automation

```bash
git checkout feature/docker-workflow-automation
git merge main
# Resolve conflicts if any (typically in .github/workflows/*)
git push origin feature/docker-workflow-automation
```

**Potential conflicts**: `.github/workflows/*`, workflow configurations

**Resolution strategy**:
- Keep custom Docker workflow triggers (DEV/PRD branches)
- Integrate upstream security fixes and improvements
- Preserve automated Docker publishing logic

#### Update nikolas/custom-setup

```bash
git checkout nikolas/custom-setup
git merge main
# Resolve conflicts if any (typically in docker-compose.yml)
git push origin nikolas/custom-setup
```

**Potential conflicts**: `docker-compose.yml`

**Resolution strategy**:
- Keep personal customizations (container names, ports, volumes)
- Keep `env_file` reference and `OPENCLAW_MINIONS_DIR` volume
- Integrate upstream service updates

### Phase 3: Update DEV Branch

**Goal**: Merge all updated branches into DEV

```bash
git checkout DEV

# Merge updated main
git merge main

# Merge updated feature branches
git merge feature/docker-workflow-automation
git merge nikolas/custom-setup

# Push to origin
git push origin DEV
```

**Expected**: Clean merges, DEV now has all latest upstream + feature work

### Phase 4: Update PRD Branch

**Goal**: Sync PRD with DEV (after validation)

```bash
git checkout PRD

# Merge updated DEV
git merge DEV

# Push to origin
git push origin PRD
```

**Expected**: Fast-forward or clean merge, PRD mirrors DEV

## Safety Checks

### Pre-Sync Checklist

Before starting the sync workflow:

- [ ] Working directory is clean (`git status`)
- [ ] No uncommitted changes that could conflict
- [ ] Upstream remote is configured (`git remote -v | grep upstream`)
- [ ] Latest upstream fetched (`git fetch upstream`)

### Verification Commands

After completing sync:

```bash
# Verify main matches upstream
git log --oneline main..upstream/main  # Should be empty

# Verify branch relationships
git log --oneline --graph --all --decorate -20

# Verify DEV contains main's commits
git log --oneline DEV | head -20

# Verify PRD matches DEV
git diff DEV PRD  # Should be empty

# Validate docker-compose (expects env vars)
docker-compose config --quiet 2>&1 | grep -v "variable is not set"
```

### Post-Sync Checklist

- [ ] `main` matches `upstream/main`
- [ ] `main` pushed to `origin/main`
- [ ] All feature branches merged main successfully
- [ ] `DEV` contains main + all feature branches
- [ ] `PRD` matches `DEV`
- [ ] All branches pushed to remote
- [ ] Docker workflows still functional (test with `pnpm build` if needed)

## Conflict Resolution

### Docker Workflow Conflicts (`.github/workflows/*`)

If conflicts occur in workflow files:

1. **Preserve custom triggers**: DEV/PRD branch push triggers
2. **Keep custom Docker tags**: `latest`, `dev`, `stable` tags
3. **Integrate upstream changes**: Security fixes, dependency updates

Example conflict resolution:

```yaml
# <<<<<<< HEAD (your custom workflow)
# push:
#   branches: [DEV, PRD]
# =======
# push:
#   branches: [main]
# >>>>>>> main

# Resolution: Keep both if needed, or keep DEV/PRD
push:
  branches: [DEV, PRD]
```

### Docker Compose Conflicts (`docker-compose.yml`)

If conflicts occur in docker-compose:

1. **Preserve customizations**:
   - `container_name` entries
   - `env_file: .env` reference
   - Custom volume mounts (`OPENCLAW_MINIONS_DIR`)
   - Custom ports if any

2. **Integrate upstream changes**:
   - New services
   - Updated image tags
   - Environment variable additions

Example conflict resolution:

```yaml
# Keep your customizations
services:
  openclaw-gateway:
    container_name: openclaw-agent  # Your custom name
    env_file:
      - .env  # Your addition
    volumes:
      - ${OPENCLAW_CONFIG_DIR}:/home/node/.openclaw
      - ${OPENCLAW_WORKSPACE_DIR}:/home/node/.openclaw/workspace
      - ${OPENCLAW_MINIONS_DIR:-/home/nikolas/minions}:/home/node/minions  # Your addition
```

### Conflict Resolution Process

1. **Identify conflicts**: `git status` shows conflicted files
2. **Analyze each conflict**: `git diff` shows conflict markers
3. **Resolve manually**: Edit files, remove markers (`<<<<<<<`, `=======`, `>>>>>>>`)
4. **Stage resolved files**: `git add <resolved-file>`
5. **Complete merge**: `git commit` (accept default message or customize)
6. **Test**: Run `pnpm build` or `docker-compose config` to verify
7. **Push**: `git push origin <branch-name>`

### Abort/Rollback

If issues occur during merge:

```bash
# Abort current merge
git merge --abort

# Reset to previous state (if needed)
git reflog  # Find previous commit
git reset --hard HEAD@{1}

# Or restore from remote
git reset --hard origin/<branch-name>
```

## Common Scenarios

### Scenario 1: Regular Upstream Sync (Weekly/Bi-weekly)

When upstream has new commits and you want to pull them in:

1. Run full Phase 1-4 workflow
2. Expect: Mostly clean merges, occasional workflow conflicts
3. Time: ~5-10 minutes

### Scenario 2: Emergency Hotfix from Upstream

When upstream has a critical fix you need immediately:

1. Run Phase 1 only (sync main)
2. Cherry-pick to DEV if urgent: `git cherry-pick <commit-sha>`
3. Or run full workflow if you have time

### Scenario 3: New Feature Branch

When creating a new feature branch:

1. Branch from main: `git checkout -b feature/my-feature main`
2. Add your work and commit
3. Add to DEV: `git checkout DEV && git merge feature/my-feature`
4. Update project.json if needed

### Scenario 4: Deleting Obsolete Branches

When a feature branch is fully merged and no longer needed:

```bash
# Verify it's merged into DEV
git log DEV | grep <branch-commit>

# Delete local branch
git branch -d feature/obsolete-branch  # Or -D if force needed

# Delete remote branch (if exists)
git push origin --delete feature/obsolete-branch
```

## Automation Helpers

### Quick Sync Script

For routine syncs, you can use the included script:

**Location**: `.claude/skills/fork-sync/scripts/quick-sync.sh`

**Usage**:
```bash
./.claude/skills/fork-sync/scripts/quick-sync.sh
```

The script performs all phases automatically with safety checks:

```bash
#!/bin/bash
# .claude/skills/fork-sync/scripts/quick-sync.sh

set -e  # Exit on error

echo "🔄 Starting fork sync workflow..."

# Phase 1: Sync main
echo "📥 Phase 1: Syncing main with upstream..."
git checkout main
git fetch upstream
git merge --ff-only upstream/main
git push origin main

# Phase 2a: Update docker workflow branch
echo "🐳 Phase 2a: Updating docker workflow branch..."
git checkout feature/docker-workflow-automation
git merge main --no-edit
git push origin feature/docker-workflow-automation

# Phase 2b: Update custom setup branch
echo "⚙️  Phase 2b: Updating custom setup branch..."
git checkout nikolas/custom-setup
git merge main --no-edit
git push origin nikolas/custom-setup

# Phase 3: Update DEV
echo "🔧 Phase 3: Updating DEV branch..."
git checkout DEV
git merge main --no-edit
git merge feature/docker-workflow-automation --no-edit
git merge nikolas/custom-setup --no-edit
git push origin DEV

# Phase 4: Update PRD
echo "🚀 Phase 4: Updating PRD branch..."
git checkout PRD
git merge DEV --no-edit
git push origin PRD

# Return to main
git checkout main

echo "✅ Fork sync complete!"
echo ""
echo "📊 Verification:"
git log --oneline --graph --all --decorate -10
```

**Note**: This script assumes no conflicts. Always review changes manually first!

## Best Practices

1. **Sync regularly**: Weekly or bi-weekly to avoid large merge conflicts
2. **Clean working directory**: Always start with `git status` showing clean
3. **Review upstream changes**: Use `git log main..upstream/main` before merging
4. **Test after sync**: Run `pnpm build` and `pnpm test` to ensure no breakage
5. **Document conflicts**: Note any recurring conflict patterns for future reference
6. **Keep main clean**: Never commit custom work to main, always use feature branches
7. **DEV before PRD**: Always test in DEV before updating PRD
8. **Update documentation**: Keep `docs/fork-workflow.md` current with any workflow changes

## Troubleshooting

### "fatal: refusing to merge unrelated histories"

**Cause**: Upstream remote not properly configured

**Fix**:
```bash
git remote add upstream https://github.com/openclaw/openclaw.git
git fetch upstream
```

### "error: Your local changes would be overwritten"

**Cause**: Uncommitted changes in working directory

**Fix**:
```bash
git status  # Review changes
git stash   # Temporarily save changes
# Run sync workflow
git stash pop  # Restore changes after sync
```

### "CONFLICT (content): Merge conflict in docker-compose.yml"

**Cause**: Both upstream and your custom setup modified docker-compose.yml

**Fix**: See "Conflict Resolution" section above for docker-compose strategies

### "Updates were rejected because the remote contains work"

**Cause**: Remote branch has commits not in local branch

**Fix**:
```bash
git pull --rebase origin <branch-name>
# Resolve conflicts if any
git push origin <branch-name>
```

## Integration with Repository Guidelines

This workflow integrates with the CLAUDE.md guidelines:

- **Commits**: Use `scripts/committer` for scoped commits
- **PRs**: When working with upstream PRs, use `gh pr view/diff` (see PR review flow in CLAUDE.md)
- **Testing**: Run `pnpm lint && pnpm build && pnpm test` after major syncs
- **Changelog**: Update CHANGELOG.md only for custom feature work, not upstream syncs

## When to Use This Skill

Invoke this skill when:

- "Sync with upstream"
- "Update fork from openclaw/openclaw"
- "Pull latest from upstream"
- "Update all branches"
- "Sync DEV and PRD"
- "Fork workflow" or "fork sync"
- Before starting major feature work (to start from latest upstream)
- After seeing `git status` shows main behind upstream/main

## When NOT to Use This Skill

Don't use for:

- Creating new feature branches (just standard git workflow)
- Working on PRs to upstream (see CLAUDE.md PR review flow instead)
- Committing changes (use `scripts/committer` per CLAUDE.md)
- One-off experiments (use temporary branches outside this structure)

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│                  Fork Sync Quick Reference                   │
├─────────────────────────────────────────────────────────────┤
│ 1. Sync main          → git checkout main                   │
│                         git merge --ff-only upstream/main   │
│                         git push origin main                │
├─────────────────────────────────────────────────────────────┤
│ 2. Update features    → git checkout feature/*              │
│                         git merge main                      │
│                         git push origin feature/*           │
├─────────────────────────────────────────────────────────────┤
│ 3. Update DEV         → git checkout DEV                    │
│                         git merge main                      │
│                         git merge feature/*                 │
│                         git push origin DEV                 │
├─────────────────────────────────────────────────────────────┤
│ 4. Update PRD         → git checkout PRD                    │
│                         git merge DEV                       │
│                         git push origin PRD                 │
├─────────────────────────────────────────────────────────────┤
│ Verify:               → git log main..upstream/main         │
│                         (should be empty)                   │
│                       → git diff DEV PRD                    │
│                         (should be empty)                   │
└─────────────────────────────────────────────────────────────┘
```

## Additional Resources

- **Full workflow docs**: `docs/fork-workflow.md`
- **Repository guidelines**: `CLAUDE.md`
- **Upstream repo**: https://github.com/openclaw/openclaw
- **Fork repo**: https://github.com/NikolasP98/openclaw
- **Docker workflow PR**: https://github.com/NikolasP98/openclaw/pull/1

---

**Skill Version**: 1.0.0
**Last Updated**: 2026-02-01
**Maintained By**: Nikolas P. (NikolasP98)
