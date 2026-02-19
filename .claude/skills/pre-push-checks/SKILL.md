---
skill: pre-push-checks
description: CI workflow validation tests and pre-push git hook gating DEV/main pushes
triggers:
  - pre-push
  - workflow tests
  - CI tests
  - push gate
  - npm-publish tests
  - add workflow test
---

# Pre-Push Checks

## What It Does

A pre-push git hook runs CI workflow validation tests before allowing pushes to `DEV` or `main`. This catches accidental regressions to workflow files (broken branch conditions, wrong tags, missing scope guards) before they reach GitHub Actions.

## How It Works

- **Git hook** (`git-hooks/pre-push`): Automatically runs on every push. Only gates `DEV` and `main` — feature branches pass through unblocked.
- **Test suite** (`test/ci/`): Vitest tests that parse workflow YAML files and assert structural invariants (triggers, conditions, tags, package scope, etc.).
- `core.hooksPath` is already set to `git-hooks` by the `prepare` script, so no setup is needed.

## Existing Tests

### `test/ci/npm-publish.test.ts`

Validates `.github/workflows/npm-publish.yml`:

- Triggers: pushes to `["main", "DEV"]` only, no `pull_request`
- Concurrency: group `npm-publish`, `cancel-in-progress: false`
- Job structure: single `publish` job, `ubuntu-latest`, `contents: read`
- Steps: checkout, setup-node-env (22.x), npm auth (NPM_TOKEN)
- Branch conditions: version-check only on `main`, prerelease only on `DEV`
- Publish tags: main -> `--tag latest`, DEV -> `--tag dev`
- Package scope: references `@nikolasp98/minion`, never `@anthropic/minion`
- Publish command: `pnpm publish --no-git-checks`

## Manual Run

```bash
pnpm vitest run test/ci/
```

## Adding New Workflow Tests

1. Create a new file in `test/ci/`, e.g. `test/ci/docker-release.test.ts`
2. Follow the same pattern: read YAML, parse, assert invariants
3. The file is auto-discovered by vitest (`test/**/*.test.ts`)
4. The pre-push hook runs all files in `test/ci/` automatically

## Escape Hatch

```bash
git push --no-verify
```
