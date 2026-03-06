# Architecture

**Analysis Date:** 2026-03-05

## Pattern Overview

**Overall:** Multi-channel AI gateway with embedded agent runtime, CLI interface, and plugin/extension system

**Key Characteristics:**

- Monorepo (pnpm workspaces) with a single main package (`@nikolasp98/minion`) plus a `ui/` sub-package and extensions
- Gateway server acts as the central hub: WebSocket + HTTP server managing channels, agents, sessions, and tools
- CLI is the primary user interface, built with Commander.js, with commands that either operate standalone or connect to the gateway via RPC
- Agent runtime ("pi-embedded") runs LLM conversations inside the gateway process with streaming, tool execution, and session management
- Channels are messaging integrations (WhatsApp, Telegram, Discord, Slack, etc.) that receive inbound messages and dispatch AI responses
- Extensions are self-contained packages in `extensions/` that add channel or capability support (e.g., Discord, Slack, Matrix, IRC)

## Layers

**Entry / Bootstrap Layer:**

- Purpose: CLI entry point, process respawning, profile loading, dotenv loading
- Location: `src/entry.ts`, `minion.mjs`, `src/cli/run-main.ts`
- Contains: Process setup, experimental warning suppression, profile argument parsing, respawn logic
- Depends on: `src/infra/`, `src/cli/`
- Used by: End users via `minion` CLI binary

**CLI Layer:**

- Purpose: User-facing command-line interface with subcommands
- Location: `src/cli/`
- Contains: Commander.js program builder, command registration, gateway RPC client, channel/agent/config/session management commands
- Key files: `src/cli/program/build-program.ts` (program construction), `src/cli/program/command-registry.ts` (lazy command loading), `src/cli/run-main.ts` (boot sequence), `src/cli/gateway-cli.ts` (gateway start command), `src/cli/gateway-rpc.ts` (RPC to running gateway)
- Depends on: `src/config/`, `src/gateway/`, `src/infra/`, `src/plugins/`
- Used by: Entry layer

**Gateway Layer:**

- Purpose: Core server runtime - WebSocket/HTTP server managing all real-time operations
- Location: `src/gateway/`
- Contains: Server lifecycle (`server.impl.ts`), WebSocket handlers, HTTP endpoints (OpenAI-compatible, Open Responses), protocol schema, authentication, session management, config reload, channel health monitoring, cron scheduling
- Key files: `src/gateway/server.impl.ts` (main server bootstrap ~500+ imports), `src/gateway/server-core/` (modular server subsystems), `src/gateway/server-methods/` (RPC method implementations), `src/gateway/protocol/` (WebSocket protocol schema with Zod validation)
- Depends on: `src/agents/`, `src/channels/`, `src/config/`, `src/infra/`, `src/plugins/`, `src/security/`
- Used by: CLI layer (via `startGatewayServer`)

**Agent Runtime Layer:**

- Purpose: LLM conversation execution with tool use, streaming, session management, and multi-agent orchestration
- Location: `src/agents/`
- Contains: Embedded PI runner (primary agent loop), system prompts, tool definitions/policies, sandbox management, skills, subagent spawning, compaction, auth profile rotation, memory integration
- Key files: `src/agents/pi-embedded-runner.ts` (barrel exports), `src/agents/pi-embedded-runner/run.ts` (core run loop), `src/agents/pi-embedded-subscribe.ts` (stream event handler), `src/agents/system-prompt.ts`, `src/agents/pi-tools.ts` (tool definitions), `src/agents/sandbox.ts` (sandbox config)
- Depends on: `src/providers/`, `src/config/`, `src/memory/`, `src/security/`, `src/tools/`
- Used by: Gateway layer, auto-reply layer

**Channel Layer:**

- Purpose: Messaging platform integrations - receive inbound messages, send outbound responses
- Location: `src/channels/`
- Contains: Channel registry, plugin system for channels, per-channel implementations (WhatsApp, Telegram, Discord, Slack, Signal, iMessage, Line), allowlist/gating, session management, coalescing
- Key files: `src/channels/plugins/index.ts` (channel plugin registry), `src/channels/impl/` (per-channel implementations), `src/channels/registry.ts`, `src/channels/dock.ts`
- Depends on: `src/config/`, `src/shared/`
- Used by: Gateway layer, auto-reply layer

**Auto-Reply Layer:**

- Purpose: Message processing pipeline - command detection, triggering agent runs, formatting/chunking responses
- Location: `src/auto-reply/`
- Contains: Inbound message processing, command detection/gating, reply dispatching with block streaming, heartbeat replies, media notes, status reporting, directive parsing (model switching, thinking level)
- Key files: `src/auto-reply/reply.ts` (reply orchestration), `src/auto-reply/dispatch.ts` (message dispatch), `src/auto-reply/envelope.ts` (message envelope), `src/auto-reply/status.ts`
- Depends on: `src/agents/`, `src/channels/`, `src/config/`
- Used by: Gateway layer, web layer

**Config Layer:**

- Purpose: Configuration loading, validation, migration, and runtime management
- Location: `src/config/`
- Contains: JSON config file I/O, Zod schema validation (strict mode), environment variable substitution, legacy config migration, session config, profile loading, path resolution
- Key files: `src/config/config.ts` (load/save), `src/config/schema.ts` + `src/config/zod-schema.ts` (validation), `src/config/types.ts` (TypeScript types), `src/config/paths.ts` (config path resolution), `src/config/legacy-migrate.ts`
- Depends on: `src/infra/`
- Used by: All layers

**Provider Layer:**

- Purpose: LLM provider abstraction - model catalog, pricing, auth, circuit breaking
- Location: `src/providers/`
- Contains: Provider registry, model catalog, pricing data, GitHub Copilot auth, Google auth, Qwen portal OAuth, circuit breaker
- Key files: `src/providers/registry.ts`, `src/providers/model-catalog.ts`, `src/providers/pricing.ts`, `src/providers/circuit-breaker.ts`
- Depends on: `src/config/`
- Used by: Agent runtime layer

**Plugin Layer:**

- Purpose: Extension point for adding capabilities via external packages
- Location: `src/plugins/`
- Contains: Plugin discovery/loading, hook runner, manifest validation, HTTP path registration, service injection, CLI command registration
- Key files: `src/plugins/discovery.ts`, `src/plugins/hooks.ts` (lifecycle hooks), `src/plugins/registry.ts`, `src/plugins/services.ts`, `src/plugins/loader.ts`
- Depends on: `src/config/`
- Used by: Gateway layer, CLI layer

**Extension Layer:**

- Purpose: Self-contained integrations packaged as workspace members
- Location: `extensions/`
- Contains: ~45 extensions including Discord, Slack, IRC, Matrix, Signal, Feishu, MS Teams, Nostr, Line, memory backends, voice call, diagnostics, etc.
- Pattern: Each extension has `package.json` + `index.ts` entry point, built by `scripts/build-extensions.ts`
- Depends on: `src/plugin-sdk/` (public API surface)
- Used by: Plugin layer (discovered at runtime)

**Infrastructure Layer:**

- Purpose: Cross-cutting utilities - process management, networking, device identity, update checking, error handling
- Location: `src/infra/`
- Contains: dotenv loading, port management, device identity/pairing, heartbeat runner, Tailscale integration, Bonjour/mDNS discovery, SSH tunneling, update checker, restart sentinel, archive management, exec approval system
- Key files: `src/infra/agent-events.ts`, `src/infra/heartbeat-runner.ts`, `src/infra/device-identity.ts`, `src/infra/ports.ts`, `src/infra/restart.ts`, `src/infra/dotenv.ts`
- Depends on: `src/config/`, `src/shared/`
- Used by: All layers

**Security Layer:**

- Purpose: Audit logging, command risk analysis, autonomy enforcement, credential injection, leak detection
- Location: `src/security/`
- Contains: Tool execution auditing, command risk scoring, shell lexer, DM policy enforcement, secret leak detection, permission levels
- Key files: `src/security/audit.ts`, `src/security/command-risk.ts`, `src/security/autonomy-enforcement.ts`, `src/security/leak-detector.ts`, `src/security/shell-lexer.ts`
- Depends on: `src/config/`
- Used by: Agent runtime layer, gateway layer

**Hooks Layer:**

- Purpose: User-defined automation hooks (Gmail, GoG OAuth, internal hooks)
- Location: `src/hooks/`
- Contains: Hook loader, Gmail integration, GoG (Google) OAuth server, hook installation, bundled hooks
- Key files: `src/hooks/hooks.ts`, `src/hooks/loader.ts`, `src/hooks/gmail.ts`, `src/hooks/gog-oauth-server.ts`
- Depends on: `src/config/`
- Used by: Gateway layer, plugin layer

**Memory Layer:**

- Purpose: Persistent memory with vector search for agent context retrieval
- Location: `src/memory/`
- Contains: SQLite-backed memory store with vector embeddings, knowledge graph, sync/batch operations, embedding providers, session file management
- Key files: `src/memory/manager.ts` (memory manager), `src/memory/sqlite.ts`, `src/memory/sqlite-vec.ts` (vector search), `src/memory/embedding/` (embedding backends)
- Depends on: `src/config/`, SQLite
- Used by: Agent runtime layer

**Browser Layer:**

- Purpose: Browser automation via Playwright and Chrome DevTools Protocol
- Location: `src/browser/`
- Contains: CDP client, Playwright AI module, Chrome profile management, extension relay, browser control server, screenshot tools
- Key files: `src/browser/cdp.ts`, `src/browser/pw-session.ts`, `src/browser/pw-ai.ts`, `src/browser/server.ts`, `src/browser/chrome.ts`
- Depends on: `src/config/`, `src/infra/`
- Used by: Agent runtime layer (as tools), CLI layer

**Logging Layer:**

- Purpose: Structured logging with subsystem tags, redaction, and diagnostic modes
- Location: `src/logging/`
- Contains: Subsystem logger factory, console capture, log redaction, reliability tracking, diagnostic session state
- Key files: `src/logging/subsystem.ts`, `src/logging/console.ts`, `src/logging/redact.ts`, `src/logging/diagnostic.ts`
- Depends on: Nothing (leaf dependency)
- Used by: All layers

**UI Layer:**

- Purpose: Control UI (web dashboard) for gateway management
- Location: `ui/`
- Contains: Vite-based SPA (separate workspace package), config editor
- Depends on: Gateway WebSocket protocol
- Used by: Gateway serves it as static assets

**Shared Utilities:**

- Purpose: Common types, helpers, and utilities used across layers
- Location: `src/shared/`, `src/utils.ts`
- Contains: Account IDs, message envelopes, delivery context, text chunking, queue helpers, usage formatting
- Key files: `src/shared/index.ts`, `src/shared/delivery-context.ts`, `src/shared/chat-envelope.ts`
- Depends on: Nothing (leaf dependency)
- Used by: All layers

## Data Flow

**Inbound Message (Channel -> Agent -> Response):**

1. Channel implementation (e.g., `src/channels/impl/whatsapp/`) receives message via platform SDK/webhook
2. Channel plugin (`src/channels/plugins/`) normalizes message into internal envelope format (`src/shared/chat-envelope.ts`)
3. Allowlist/gating checks (`src/channels/allowlists/`, `src/channels/command-gating.ts`)
4. Auto-reply dispatch (`src/auto-reply/dispatch.ts`) determines if message triggers an agent run
5. Command detection (`src/auto-reply/command-detection.ts`) checks for inline commands (status, model switch, etc.)
6. Agent runner (`src/agents/pi-embedded-runner/run.ts`) executes LLM conversation with tools
7. Stream subscriber (`src/agents/pi-embedded-subscribe.ts`) handles streaming events, tool calls, compaction
8. Reply formatting/chunking (`src/auto-reply/reply.ts`, `src/auto-reply/chunk.ts`) prepares response blocks
9. Channel outbound sends response back to user via platform API

**Gateway WebSocket (Client <-> Server):**

1. Client (CLI, TUI, Control UI, mobile app) connects via WebSocket to gateway
2. Authentication via device token or gateway auth token (`src/gateway/auth/`)
3. Client sends JSON-RPC-style method calls (defined in `src/gateway/server-core/server-methods-list.ts`)
4. Server dispatches to handler in `src/gateway/server-methods/` (e.g., `chat.ts`, `agents.ts`, `config.ts`)
5. Server broadcasts events to subscribed clients via `src/gateway/server-core/server-broadcast.ts`

**OpenAI-Compatible HTTP API:**

1. HTTP request arrives at `/v1/chat/completions` or `/v1/responses`
2. `src/gateway/openai-http.ts` or `src/gateway/openresponses-http.ts` handles request
3. Routes to embedded agent runner
4. Streams SSE response back

**State Management:**

- Config: JSON file on disk, loaded into memory, reloaded on file change (`src/gateway/config-reload.ts`)
- Sessions: JSON files per session in state directory (`src/config/sessions.ts`, `src/gateway/sessions/`)
- Memory: SQLite database with vector embeddings (`src/memory/sqlite.ts`)
- Agent state: In-memory run tracking (`src/agents/pi-embedded-runner/runs.ts`)

## Key Abstractions

**Channel Plugin:**

- Purpose: Represents a messaging platform integration
- Examples: `src/channels/impl/whatsapp/`, `src/channels/impl/telegram/`, `extensions/discord/`
- Pattern: Implements channel lifecycle (login, monitor inbox, send message), registered via plugin registry

**Embedded PI Runner:**

- Purpose: Core agent execution loop - manages LLM API calls, tool execution, streaming, compaction
- Examples: `src/agents/pi-embedded-runner/run.ts`, `src/agents/pi-embedded-subscribe.ts`
- Pattern: Event-driven streaming with handlers for text, tool calls, lifecycle events

**Gateway Server Method:**

- Purpose: Individual RPC endpoint exposed over WebSocket
- Examples: `src/gateway/server-methods/chat.ts`, `src/gateway/server-methods/agents.ts`, `src/gateway/server-methods/config.ts`
- Pattern: Handler function receiving parsed params, returning result or broadcasting events

**Protocol Schema:**

- Purpose: Zod-validated request/response schemas for the WebSocket protocol
- Examples: `src/gateway/protocol/schema/` (20+ schema files)
- Pattern: Zod schemas defining method params and return types, used for runtime validation

**Config Types + Zod Schema:**

- Purpose: Configuration structure with strict validation
- Examples: `src/config/types.ts` (TypeScript types), `src/config/zod-schema.ts` (Zod schemas)
- Pattern: TypeScript types define structure, Zod schemas validate at load time (`.strict()` rejects unknown keys)

**Plugin SDK:**

- Purpose: Public API surface for extensions
- Examples: `src/plugin-sdk/index.ts`
- Pattern: Exports stable interfaces for extension authors (account IDs, tool sending, config paths, webhooks)

**Skill:**

- Purpose: Bundled or user-installed automation scripts the agent can invoke
- Examples: `skills/` directory with ~60 skills (coding-agent, github, slack, obsidian, etc.)
- Pattern: Each skill has `index.ts` or manifest describing what the agent can do with it

## Entry Points

**CLI Binary (`minion`):**

- Location: `minion.mjs` -> `dist/entry.js` -> `src/entry.ts`
- Triggers: User runs `minion <command>` from terminal
- Responsibilities: Bootstrap Node.js environment, load profiles, delegate to Commander.js program

**Gateway Server:**

- Location: `src/gateway/server.impl.ts` (`startGatewayServer()`)
- Triggers: `minion gateway` CLI command or `minion` (default command)
- Responsibilities: Start WebSocket/HTTP server, initialize channels, load plugins, start cron, begin health monitoring

**OpenAI HTTP API:**

- Location: `src/gateway/openai-http.ts`, `src/gateway/openresponses-http.ts`
- Triggers: HTTP requests to `/v1/chat/completions`, `/v1/responses`
- Responsibilities: Accept OpenAI-compatible API calls, route to agent runner

**Control UI:**

- Location: `ui/` (Vite SPA), served by gateway at root path
- Triggers: Browser navigates to gateway URL
- Responsibilities: Web dashboard for config editing, session viewing, channel management

**TUI (Terminal UI):**

- Location: `src/tui/tui.ts`
- Triggers: `minion tui` CLI command
- Responsibilities: Interactive terminal chat interface with the agent

## Error Handling

**Strategy:** Multi-layered with graceful degradation

**Patterns:**

- Global uncaught exception/rejection handlers in `src/entry.ts` and `src/cli/run-main.ts` log and exit
- Agent runtime uses circuit breaker (`src/providers/circuit-breaker.ts`) for LLM provider failures with cooldown
- Auth profile rotation (`src/agents/auth-profiles.ts`) automatically fails over to next API key on billing/rate errors
- Config validation uses Zod `.strict()` - unknown keys cause fatal startup errors (intentional fail-fast)
- Channel health monitor (`src/gateway/channel-health-monitor.ts`) tracks channel connectivity
- Compaction retry logic in agent runner handles context window overflow
- Structured error logging via subsystem loggers with redaction (`src/logging/redact.ts`)

## Cross-Cutting Concerns

**Logging:** Subsystem-based structured logging (`src/logging/subsystem.ts`). Each module creates tagged child loggers. Console output captured and redirected. Sensitive data redacted via `src/logging/redact.ts`.

**Validation:** Zod schemas for config (`src/config/zod-schema.ts`) and protocol messages (`src/gateway/protocol/schema/`). Config uses `.strict()` mode - unknown fields are fatal.

**Authentication:** Gateway auth via device tokens or gateway auth token (`src/gateway/auth/`). LLM provider auth via API keys with profile rotation (`src/agents/auth-profiles.ts`). Channel auth per-platform (OAuth, QR codes, tokens). Rate limiting via `src/gateway/auth/auth-rate-limit.ts`.

**Security:** Command risk analysis before tool execution (`src/security/command-risk.ts`). Exec approval system for dangerous operations (`src/infra/exec-approvals.ts`). Sandbox isolation for agent code execution (`src/agents/sandbox.ts`). DM policy enforcement (`src/security/dm-policy-shared.ts`). Secret leak detection (`src/security/leak-detector.ts`).

---

_Architecture analysis: 2026-03-05_
