---
summary: "CLI reference for `minion reset` (reset local state/config)"
read_when:
  - You want to wipe local state while keeping the CLI installed
  - You want a dry-run of what would be removed
title: "reset"
---

# `minion reset`

Reset local config/state (keeps the CLI installed).

```bash
minion reset
minion reset --dry-run
minion reset --scope config+creds+sessions --yes --non-interactive
```
