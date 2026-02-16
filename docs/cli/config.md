---
summary: "CLI reference for `minion config` (get/set/unset config values)"
read_when:
  - You want to read or edit config non-interactively
title: "config"
---

# `minion config`

Config helpers: get/set/unset values by path. Run without a subcommand to open
the configure wizard (same as `minion configure`).

## Examples

```bash
minion config get browser.executablePath
minion config set browser.executablePath "/usr/bin/google-chrome"
minion config set agents.defaults.heartbeat.every "2h"
minion config set agents.list[0].tools.exec.node "node-id-or-name"
minion config unset tools.web.search.apiKey
```

## Paths

Paths use dot or bracket notation:

```bash
minion config get agents.defaults.workspace
minion config get agents.list[0].id
```

Use the agent list index to target a specific agent:

```bash
minion config get agents.list
minion config set agents.list[1].tools.exec.node "node-id-or-name"
```

## Values

Values are parsed as JSON5 when possible; otherwise they are treated as strings.
Use `--json` to require JSON5 parsing.

```bash
minion config set agents.defaults.heartbeat.every "0m"
minion config set gateway.port 19001 --json
minion config set channels.whatsapp.groups '["*"]' --json
```

Restart the gateway after edits.
