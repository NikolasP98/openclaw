---
summary: "CLI reference for `minion agents` (list/add/delete/set identity)"
read_when:
  - You want multiple isolated agents (workspaces + routing + auth)
title: "agents"
---

# `minion agents`

Manage isolated agents (workspaces + auth + routing).

Related:

- Multi-agent routing: [Multi-Agent Routing](/concepts/multi-agent)
- Agent workspace: [Agent workspace](/concepts/agent-workspace)

## Examples

```bash
minion agents list
minion agents add work --workspace ~/.minion/workspace-work
minion agents set-identity --workspace ~/.minion/workspace --from-identity
minion agents set-identity --agent main --avatar avatars/minion.png
minion agents delete work
```

## Identity files

Each agent workspace can include an `IDENTITY.md` at the workspace root:

- Example path: `~/.minion/workspace/IDENTITY.md`
- `set-identity --from-identity` reads from the workspace root (or an explicit `--identity-file`)

Avatar paths resolve relative to the workspace root.

## Set identity

`set-identity` writes fields into `agents.list[].identity`:

- `name`
- `theme`
- `emoji`
- `avatar` (workspace-relative path, http(s) URL, or data URI)

Load from `IDENTITY.md`:

```bash
minion agents set-identity --workspace ~/.minion/workspace --from-identity
```

Override fields explicitly:

```bash
minion agents set-identity --agent main --name "Minion" --emoji "🦑" --avatar avatars/minion.png
```

Config sample:

```json5
{
  agents: {
    list: [
      {
        id: "main",
        identity: {
          name: "Minion",
          theme: "space squid",
          emoji: "🦑",
          avatar: "avatars/minion.png",
        },
      },
    ],
  },
}
```
