---
summary: "CLI reference for `minion tui` (terminal UI connected to the Gateway)"
read_when:
  - You want a terminal UI for the Gateway (remote-friendly)
  - You want to pass url/token/session from scripts
title: "tui"
---

# `minion tui`

Open the terminal UI connected to the Gateway.

Related:

- TUI guide: [TUI](/web/tui)

## Examples

```bash
minion tui
minion tui --url ws://127.0.0.1:18789 --token <token>
minion tui --session main --deliver
```
