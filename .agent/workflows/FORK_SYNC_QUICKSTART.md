# OpenClaw Fork Sync - Quick Start

## Current State (Ready to Use!)

✅ Main branch is now clean and synced with origin
✅ Git alias `sync-upstream` is configured globally
✅ Branch tracking configured for DEV and PRD
✅ Full workflow documentation: `.agent/workflows/openclaw-fork-sync.md`

## Your Workflow in Action

### Weekly/Regular Sync (One Command!)

```bash
git sync-upstream
```

**This does**:

- Fetches latest from upstream
- Fast-forwards main to upstream/main
- Merges main into DEV
- Pushes both branches to origin
- Leaves you on DEV ready to work

**This does NOT**:

- Touch feature branches or PRD (manually managed)
- Overwrite your custom Docker code (merge protects it)
- Delete anything

### Manual Branch Updates

**Update feature branches when needed:**

```bash
git checkout feature/your-feature
git rebase DEV  # or git merge DEV
git push -f
```

**Update PRD when ready for production:**

```bash
# Test DEV thoroughly first!
git checkout PRD
git merge DEV -m "Release: promote DEV to production"
git push origin PRD
```

### Daily Feature Work

```bash
# Create feature from DEV
git checkout DEV
git checkout -b feature/my-new-thing

# Work on it
git add .
git commit -m "feat: add my new thing"
git push origin feature/my-new-thing

# Keep feature updated if DEV advances
git checkout DEV && git pull
git checkout feature/my-new-thing
git rebase DEV
git push -f

# Merge back to DEV when done
git checkout DEV
git merge --no-ff feature/my-new-thing
git push origin DEV
```

## Why This Works

### Your Concern: "Updates overwriting my custom code"

**Reality**: Git merge is smart! Here's what happens:

**Scenario 1: No overlap (99% of syncs)**

- Upstream changes: `src/gateway/*.ts`, `docs/*.md`
- You changed: `Dockerfile`, `docker-compose.yml`, `entrypoint.sh`
- **Result**: ✅ Both sets automatically preserved

**Scenario 2: Conflicts (rare)**

- Upstream changed: `Dockerfile` line 10
- You changed: `Dockerfile` line 10
- **Result**: ⚠️ Git STOPS and asks you to resolve (YOUR CHOICE)

**Scenario 3: Same file, different lines**

- Upstream changed: `Dockerfile` line 10
- You changed: `Dockerfile` line 50
- **Result**: ✅ Both changes merged in same file

### Why Merge > Cherry-Pick

| Merge (✅ Use This)            | Cherry-Pick (❌ Avoid)      |
| ------------------------------ | --------------------------- |
| Automatic - brings all commits | Manual - select each commit |
| Preserves relationships        | Creates duplicate commits   |
| Idempotent - safe to repeat    | Easy to lose track          |
| Self-documenting               | Tedious and error-prone     |

## Branch Strategy

```
upstream/main (openclaw/openclaw)
    ↓ git sync-upstream (automated)
main (clean mirror)
    ↓ git sync-upstream (automated)
DEV (development + custom Docker work)

───────────────────────────────────
Manual (update when needed):
───────────────────────────────────
feature/* branches → rebase/merge from DEV
PRD → merge from DEV
```

## Next Steps

1. **Test the workflow**:

   ```bash
   git sync-upstream
   ```

2. **Read the full guide** when you have time:
   `.agent/workflows/openclaw-fork-sync.md`

3. **Start using feature branches** for your work:
   ```bash
   git checkout -b feature/docker-improvements
   ```

## Common Questions

**Q: Will this delete my Docker customizations?**
A: No! Merge preserves both upstream changes AND your custom code. Conflicts only occur if BOTH modified the same lines, and Git will ask you to resolve.

**Q: What if I get conflicts?**
A: Git stops and shows conflict markers. Edit the file, keep what you want, stage with `git add`, then `git commit`. See full guide for examples.

**Q: When should I update PRD?**
A: Only after testing DEV thoroughly. PRD is production - promote manually, not automatically.

**Q: Can I still use cherry-pick?**
A: For normal syncing, no - merge is better. Only use cherry-pick for one-off fixes if absolutely needed.

## Verification Commands

```bash
# Check main is clean mirror of upstream
git log --oneline main..upstream/main  # Should be empty

# Check DEV contains main
git merge-base --is-ancestor main DEV && echo "✓ DEV up to date"

# View branch structure
git log --oneline --graph --all --decorate -20
```

## Get Help

- Full workflow documentation: `.agent/workflows/openclaw-fork-sync.md`
- Troubleshooting section covers common issues
- Git conflict resolution examples included
