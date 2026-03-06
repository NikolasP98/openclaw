# Tools CLI Design

**Date:** 2026-03-04
**Status:** Approved

## Summary

Add `minion tools` CLI subcommand for managing tool policies, status, scaffolding, and installation. Gateway-required for read operations, direct config writes for mutations with `tools.reload` RPC for hot-reload.

## Decisions

- **Connectivity:** Gateway-required (all reads via `tools.status` RPC)
- **Scope:** Global + per-agent (`--agent` flag)
- **Approach:** Thin CLI over existing RPC + config (Approach A)
- **Config model:** Uses `alsoAllow`/`deny` exclusively; never touches `allow` directly (avoids Zod conflict validation)
- **Includes:** Scaffolding (`create`) and install support (`install`)

## CLI Command Surface

```
minion tools list [--agent <id>] [--group <name>] [--json]
minion tools status <tool-id> [--agent <id>] [--json]
minion tools groups [--json]
minion tools enable <tool-or-group> [--agent <id>]
minion tools disable <tool-or-group> [--agent <id>]
minion tools profile <profile-id> [--agent <id>]
minion tools install <tool-id>
minion tools create <tool-id> [--group <name>]
minion tools reload
```

### Behavior

- **list** — Calls `tools.status` RPC, renders table (name, groups, enabled, requires). Filterable by `--group` and `--agent`.
- **status** — Detailed single-tool view (groups, requires, install instructions, condition, enabled state).
- **groups** — Lists all groups and their member tools.
- **enable** — Accepts tool ID or `group:*` name. Adds to `tools.alsoAllow` (global) or `agents[].tools.alsoAllow` (with `--agent`). Removes from `deny` if present. Calls `tools.reload`.
- **disable** — Adds to `tools.deny` (or `agents[].tools.deny`). Removes from `alsoAllow` if present. Calls `tools.reload`.
- **profile** — Sets `tools.profile` (or `agents[].tools.profile` with `--agent`). Calls `tools.reload`.
- **install** — Reads `meta.install` from RPC, detects package manager, runs install command, verifies binary.
- **create** — Scaffolds `*-tool.ts` + `*-tool.meta.ts` with boilerplate, runs `pnpm generate:tools`.
- **reload** — Calls `tools.reload` gateway RPC to re-read config and re-evaluate policies.

## Config Interaction

### Enable Flow

```
minion tools enable group:gog --agent panik
```

1. Read config snapshot
2. Find `agents[].tools` for agent `panik` (create if missing)
3. Remove `"group:gog"` and all `gog_*` tool IDs from `deny` (if present)
4. Add `"group:gog"` to `alsoAllow` (if not already present)
5. Write config back
6. Call `tools.reload` RPC

### Disable Flow

```
minion tools disable summarize
```

1. Read config snapshot
2. Add `"summarize"` to global `tools.deny`
3. Remove `"summarize"` from `alsoAllow` (if present)
4. Write config, call `tools.reload`

### Profile Flow

```
minion tools profile coding --agent panik
```

1. Set `agents[panik].tools.profile = "coding"`
2. Write config, call `tools.reload`

### Key Rule

`allow` and `alsoAllow` are mutually exclusive (Zod validation). The CLI uses `alsoAllow` + `deny` exclusively. This avoids the conflict and is additive by design.

## Scaffold (`minion tools create`)

```
minion tools create my-tool --group minion
```

1. Derives names: `my-tool` -> file prefix `my-tool-tool`, factory `createMyToolTool`, ID `my_tool`
2. Generates `src/agents/tools/my-tool-tool.meta.ts` with ToolMeta boilerplate
3. Generates `src/agents/tools/my-tool-tool.ts` with factory function, Typebox schema, jsonResult pattern
4. Runs `pnpm generate:tools` to update registry
5. Prints next steps (add to `TOOL_ORDER` if ordering matters, add `buildToolOptions` case if context keys needed)

## Install (`minion tools install`)

1. Calls `tools.status` RPC to get meta for the tool
2. Reads `meta.install` array (e.g., `[{ kind: "brew", formula: "...", bins: ["..."] }]`)
3. Detects available package manager (brew on macOS, apt on Debian, npm fallback)
4. Picks matching install instruction by `kind`
5. Runs the install command
6. Verifies binary availability (`which <bin>`)

## Gateway: `tools.reload` RPC

```typescript
"tools.reload": ({ respond }) => {
  invalidateConfigCache();
  const cfg = loadConfig();
  respond(true, { reloaded: true, profile: resolveDefaultToolProfile(cfg) });
}
```

Only reloads config and policy resolution. Does NOT affect running agent sessions (their tools are already instantiated). New sessions pick up changes.

## File Structure

### New Files

```
src/cli/tools-cli.ts              # Commander registration + subcommands
src/cli/tools-cli.scaffold.ts     # Template generation for `create`
src/cli/tools-cli.install.ts      # Package manager detection + install
```

### Modified Files

```
src/cli/program/command-registry.ts   # Add tools entry to coreEntries
src/gateway/server-methods/tools.ts   # Add tools.reload handler
```

### Unchanged

No changes to config types, Zod schemas, tool-meta.ts, tool-policy.ts, or the tool registry codegen system. Everything needed already exists.
