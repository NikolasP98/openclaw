---
summary: "CLI reference for `minion setup` (initialize config + workspace)"
read_when:
  - You’re doing first-run setup without the full onboarding wizard
  - You want to set the default workspace path
title: "setup"
---

# `minion setup`

Initialize `~/.minion/minion.json` and the agent workspace.

Related:

- Getting started: [Getting started](/start/getting-started)
- Wizard: [Onboarding](/start/onboarding)

## Examples

```bash
minion setup
minion setup --workspace ~/.minion/workspace
```

To run the wizard via setup:

```bash
minion setup --wizard
```
