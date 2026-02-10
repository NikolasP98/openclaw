# Fork Sync Skill

Comprehensive workflow automation for syncing the OpenClaw fork with upstream and managing the DEV/PRD branch structure.

## Overview

This skill manages the complete fork synchronization workflow for the OpenClaw fork, including:

- Syncing `main` with `upstream/main`
- Updating `DEV` (integration) branch with upstream changes
- Handling merge conflicts
- Validating sync success

**Note**: Feature branches and PRD are no longer auto-synced. Manage them manually when needed.

## Files

```
.claude/skills/fork-sync/
├── SKILL.md              # Main skill documentation and procedures
├── README.md             # This file
└── scripts/
    └── quick-sync.sh     # Automated sync script with safety checks
```

## Quick Start

### Using the Skill via Claude Code

Simply invoke the skill by mentioning:

- "sync fork"
- "update from upstream"
- "sync with upstream"
- "update branches"
- "fork workflow"

### Using the Script Directly

For routine syncs (when no conflicts are expected):

```bash
./.claude/skills/fork-sync/scripts/quick-sync.sh
```

The script includes:

- ✅ Pre-flight checks (clean working directory, upstream configured)
- ✅ Interactive confirmation with new commit preview
- ✅ Automatic execution of all 3 phases (0, 1, 2)
- ✅ Post-sync verification
- ✅ Error handling and rollback on conflicts

## Branch Structure

```
upstream/main → main → DEV
```

- **main**: Clean mirror of upstream, no custom work
- **DEV**: Integration branch with all custom work
- **Feature branches** (manual): Update by rebasing or merging from DEV
- **PRD** (manual): Update by merging from DEV when ready

## Documentation

Full workflow details: `docs/fork-workflow.md`

## When to Sync

- **Weekly/bi-weekly**: Routine sync to stay current with upstream
- **Before major work**: Start new features from latest upstream
- **After upstream hotfix**: Pull critical fixes quickly
- **Before releases**: Ensure all latest fixes are included

## Safety Features

The workflow includes:

1. **Pre-flight checks**: Verifies clean working directory and upstream configuration
2. **Conflict detection**: Stops on merge conflicts with rollback instructions
3. **Verification steps**: Confirms sync success after completion
4. **Rollback procedures**: Clear instructions for undoing failed syncs

## Common Conflicts

The skill provides resolution strategies for:

- **Docker workflow files** (`.github/workflows/*`): Preserve custom triggers
- **Docker compose** (`docker-compose.yml`): Keep personal customizations

See SKILL.md for detailed conflict resolution procedures.

## Version

- **Version**: 1.0.0
- **Created**: 2026-02-01
- **Last Updated**: 2026-02-01
- **Maintained By**: Nikolas P. (NikolasP98)

## Branch Management Notes

**Feature branches**: No longer auto-synced. To update manually:

```bash
git checkout feature/your-feature
git rebase DEV
# or
git merge DEV -m "Update feature with latest"
```

**PRD branch**: No longer auto-synced. To update manually:

```bash
git checkout PRD
git merge DEV -m "Manual sync from DEV"
git push origin PRD
```

## Related Resources

- Repository guidelines: `CLAUDE.md`
- Fork workflow docs: `docs/fork-workflow.md`
- Upstream repo: https://github.com/openclaw/openclaw
- Fork repo: https://github.com/NikolasP98/openclaw
