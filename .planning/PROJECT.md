# Auth Request/Response Framework

## What This Is

A robust async auth request/response framework for the Minion agent runtime. Agents initiate authentication flows (starting with Google OAuth) via blocking tool calls that don't return until the auth resolves — success, failure, timeout, or user cancellation. The framework includes lifecycle hooks for the gateway and behavior constraints that prevent agents from abandoning auth mid-flow. Designed to be extensible to future auth providers beyond Google.

## Core Value

When an agent starts an auth flow, it completes. The agent blocks until auth resolves — no wandering off, no dropped flows, no silent failures.

## Requirements

### Validated

- Google OAuth URL generation with correct parameters (access_type=offline, scopes) — existing
- OAuth callback server for token exchange — existing
- gog CLI integration for Google Drive/Gmail operations — existing
- Agent tool definitions for auth start (`gog-auth-start-tool`) — existing
- Multi-channel message delivery (WhatsApp, Telegram, etc.) — existing
- Gateway lifecycle with WebSocket/HTTP server — existing
- Agent runtime with tool execution loop — existing

### Active

- [ ] Blocking auth tool call — agent calls auth tool, tool doesn't return until resolved
- [ ] Auth resolution states — success (tokens), failure (reason), timeout (configurable), user cancellation
- [ ] Lifecycle hooks — on-auth-start, on-auth-pending, on-auth-complete, on-auth-failed for gateway/system observability
- [ ] Agent behavior lock — prevent agent from executing non-auth tools while auth is pending
- [ ] Unified auth flow for all gog services (Drive, Gmail, Calendar, etc.)
- [ ] Extensible provider interface — Google is first implementation, architecture supports future providers
- [ ] Explicit cancellation only — auth flow persists until resolved or user explicitly cancels

### Out of Scope

- Adding new auth providers (beyond Google) — future milestone, architecture supports it
- Changing the gog CLI itself — we wrap it, not modify it
- UI/frontend for auth — auth happens via chat message links
- Token refresh/rotation automation — separate concern

## Context

The current implementation has two problems:

1. **No feedback loop** — `gog-auth-start-tool` fires the OAuth URL to the user and immediately returns. The agent has no way to know if auth succeeded, failed, or is still pending.
2. **No flow discipline** — After sending the URL, the agent moves on to other tasks. If the user completes auth later, the agent may have lost context or started something else entirely.

The fix is architectural: make the auth tool call **blocking** (it awaits resolution), and add **lifecycle hooks** so the gateway can observe and react to auth events. The agent runtime already supports long-running tool calls — this extends that pattern.

Existing code:

- `src/agents/tools/gog-auth-start-tool.ts` — current fire-and-forget auth tool
- `src/hooks/gog-oauth-server.ts` — OAuth callback server (token exchange)
- `src/hooks/gog-oauth-types.ts` — OAuth type definitions
- `src/agents/pi-embedded-runner/run.ts` — agent runtime loop

## Constraints

- **Tech stack**: TypeScript, Node.js — must integrate with existing agent runtime and gateway
- **Backward compatible**: Existing gog CLI tools must continue to work
- **No new dependencies**: Use existing patterns (EventEmitter, Promises) for async coordination
- **Multi-channel**: Auth URLs sent via WhatsApp/Telegram/etc. — callback comes via HTTP, not the chat channel

## Key Decisions

| Decision                             | Rationale                                                       | Outcome    |
| ------------------------------------ | --------------------------------------------------------------- | ---------- |
| Blocking tool call model             | Agent can't wander off during auth — strictness is free         | -- Pending |
| Event-driven with Promise resolution | Clean async pattern, no polling needed                          | -- Pending |
| Provider-extensible interface        | Google first, but architecture should support others            | -- Pending |
| Claude decides: enhance vs rebuild   | Whatever produces cleanest implementation of the blocking model | -- Pending |

---

_Last updated: 2026-03-05 after initialization_
