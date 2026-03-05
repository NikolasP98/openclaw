# Codebase Structure

**Analysis Date:** 2026-03-05

## Directory Layout

```
openclaw/
├── src/                    # Main TypeScript source code
│   ├── entry.ts            # CLI entry point (respawn, profile, boot)
│   ├── index.ts            # Library entry point (public API exports)
│   ├── runtime.ts          # Runtime environment types
│   ├── globals.ts          # Global declarations
│   ├── utils.ts            # Top-level utility functions
│   ├── logging.ts          # Console capture setup
│   ├── channel-web.ts      # Web channel monitor
│   ├── extensionAPI.ts     # Extension API surface
│   ├── agents/             # Agent runtime (LLM execution, tools, skills, sandbox)
│   ├── auto-reply/         # Message processing pipeline (inbound -> agent -> outbound)
│   ├── browser/            # Browser automation (Playwright, CDP, Chrome)
│   ├── canvas-host/        # Canvas host server (A2UI)
│   ├── channels/           # Messaging channel abstractions and implementations
│   ├── cli/                # CLI commands (Commander.js)
│   ├── config/             # Configuration loading, validation, migration
│   ├── db/                 # Database migrations
│   ├── dispatch/           # Group message queue dispatch
│   ├── docs/               # In-app documentation helpers
│   ├── eval/               # Evaluation utilities (ROI estimator)
│   ├── gateway/            # Gateway server (WebSocket + HTTP)
│   ├── health/             # Health check utilities
│   ├── hooks/              # User-defined automation hooks (Gmail, OAuth)
│   ├── infra/              # Infrastructure utilities (networking, identity, updates)
│   ├── link-understanding/ # URL/link content extraction
│   ├── linq/               # LINQ-style query utilities
│   ├── logging/            # Structured logging subsystem
│   ├── macos/              # macOS-specific integrations
│   ├── markdown/           # Markdown processing
│   ├── media/              # Media handling (images, audio)
│   ├── media-understanding/# Media content analysis
│   ├── memory/             # Persistent memory (SQLite + vector search)
│   ├── node-host/          # Remote node hosting
│   ├── pairing/            # Device pairing
│   ├── pipeline/           # Workflow pipeline runner
│   ├── platform/           # Platform abstractions (process, exec)
│   ├── plugins/            # Plugin system (discovery, hooks, services)
│   ├── plugin-sdk/         # Public SDK for extension authors
│   ├── polls.ts            # Polling utilities
│   ├── providers/          # LLM provider registry and auth
│   ├── registry/           # Generic registry utilities
│   ├── routing/            # Message routing (multi-LLM, session keys)
│   ├── scripts/            # Build-time scripts
│   ├── security/           # Security (audit, risk analysis, leak detection)
│   ├── sessions/           # Session management utilities
│   ├── shared/             # Shared types and utilities
│   ├── terminal/           # Terminal styling and formatting
│   ├── test-support/       # Shared test utilities
│   ├── tools/              # Tool registry and validation
│   ├── tts/                # Text-to-speech
│   ├── tui/                # Terminal UI (interactive chat)
│   ├── types/              # Global type definitions
│   ├── web/                # Web channel (WhatsApp Web, login, session)
│   └── wizard/             # Onboarding wizard
├── extensions/             # Extension packages (~45 integrations)
│   ├── discord/            # Discord integration
│   ├── slack/              # Slack integration
│   ├── telegram/           # Telegram extras
│   ├── irc/                # IRC integration
│   ├── matrix/             # Matrix integration
│   ├── signal/             # Signal integration
│   ├── memory-core/        # Core memory extension
│   ├── memory-lancedb/     # LanceDB memory backend
│   ├── voice-call/         # Voice call support
│   ├── diagnostics-otel/   # OpenTelemetry diagnostics
│   └── ...                 # Many more (feishu, msteams, nostr, etc.)
├── skills/                 # Agent skills (~60 skill directories)
│   ├── coding-agent/       # Coding assistance
│   ├── github/             # GitHub operations
│   ├── slack/              # Slack operations
│   ├── obsidian/           # Obsidian notes
│   ├── canvas/             # Canvas interactions
│   └── ...                 # Many more domain-specific skills
├── ui/                     # Control UI (Vite SPA)
│   ├── src/                # React/Vue frontend source
│   ├── config-editor/      # Config editor component
│   ├── vite.config.ts      # Vite build config
│   └── package.json        # Separate workspace package
├── apps/                   # Native applications (not rebranded)
│   ├── ios/                # iOS app (Swift, OpenClaw naming)
│   ├── macos/              # macOS app (Swift, OpenClaw naming)
│   ├── android/            # Android app (Kotlin)
│   └── shared/             # Shared native code (OpenClawKit)
├── packages/               # Additional workspace packages
│   ├── minionbot/          # Minion bot package
│   └── moltbot/            # Molt bot package
├── scripts/                # Build, deployment, and utility scripts
├── setup/                  # Server setup framework
│   ├── setup.sh            # Entry point
│   ├── phases/             # Setup phases
│   ├── templates/          # Config templates
│   └── utilities/          # Setup helper scripts
├── docker/                 # Docker configuration
├── docs/                   # Documentation (Markdown)
├── test/                   # E2E and integration test config
├── profiles/               # CLI profiles
├── assets/                 # Static assets (Chrome extension icons)
├── patches/                # pnpm patch overrides
├── git-hooks/              # Git hook scripts
├── .github/                # GitHub Actions workflows and composite actions
│   ├── workflows/          # CI/CD workflows
│   ├── actions/            # Composite actions
│   └── servers/            # Server config JSON files
├── minion.mjs              # CLI binary entry (published to npm)
├── tsdown.config.ts        # Build config (tsdown bundler)
├── tsconfig.json           # TypeScript config
├── vitest.config.ts        # Primary test config
├── vitest.*.config.ts      # Specialized test configs (e2e, unit, gateway, live, extensions)
├── package.json            # Root package manifest
├── pnpm-workspace.yaml     # Workspace definition
├── Dockerfile              # Main Docker build
├── Dockerfile.sandbox*     # Sandbox Docker variants
├── docker-compose.yml      # Docker Compose setup
└── AGENTS.md               # Agent instructions (aliased as CLAUDE.md)
```

## Directory Purposes

**`src/agents/`:**

- Purpose: Core agent runtime - LLM conversation execution
- Contains: PI embedded runner, system prompts, tool definitions, tool policies, sandbox config, skills management, subagent orchestration, auth profile rotation, compaction
- Key files: `pi-embedded-runner.ts` (barrel), `pi-embedded-runner/run.ts` (core loop), `pi-embedded-subscribe.ts` (stream handler), `system-prompt.ts`, `pi-tools.ts`, `sandbox.ts`, `skills.ts`, `auth-profiles.ts`
- Subdirs: `pi-embedded-runner/` (run logic), `pi-embedded-helpers/` (formatting), `pi-extensions/` (agent extensions), `models/` (model catalog/selection), `subagents/` (multi-agent), `skills/` (skill loading), `tools/` (tool definitions), `sandbox/` (sandbox config), `sessions/` (agent session state), `bash/` (bash tool), `cli-runner/` (CLI backend runner), `identity/` (agent identity), `schema/` (agent schemas), `auth-profiles/` (API key rotation), `test-support/` (test helpers)

**`src/gateway/`:**

- Purpose: WebSocket + HTTP server runtime
- Contains: Server bootstrap, protocol definitions, RPC methods, auth, sessions, config API, hooks integration, OpenAI-compatible endpoints
- Key files: `server.impl.ts` (main bootstrap), `server.ts` (public exports), `server-core/` (modular subsystems), `server-methods/` (RPC handlers), `protocol/` (schema), `auth/` (authentication), `sessions/` (session utils)
- Subdirs: `server-core/` (~40 files: channels, chat, cron, discovery, HTTP, plugins, reload, startup, Tailscale, WebSocket), `server-methods/` (~40 files: agent, chat, config, models, nodes, sessions, tools, etc.), `protocol/` (Zod schemas for all RPC methods), `auth/` (rate limiting, device auth, startup auth), `sessions/` (session patching, resolution), `server/` (health state, TLS, close reason)

**`src/cli/`:**

- Purpose: All CLI commands and argument parsing
- Contains: Command implementations for gateway, channels, config, agents, models, sessions, browser, nodes, skills, TUI, security, etc.
- Key files: `program/build-program.ts`, `program/command-registry.ts`, `run-main.ts`, `gateway-cli.ts`, `gateway-rpc.ts`
- Subdirs: `program/` (Commander.js program building, lazy registration), `commands/` (additional commands), `gateway-cli/` (gateway-specific CLI), `daemon-cli/` (daemon management), `update-cli/` (self-update), `node-cli/` (node management), `nodes-cli/` (node operations), `cron-cli/` (cron management), `browser-cli-actions-input/` (browser input), `shared/` (shared CLI utils)

**`src/config/`:**

- Purpose: Configuration system (load, validate, migrate, write)
- Contains: Config file I/O, Zod validation schemas, TypeScript type definitions, env var substitution, legacy migration, session config, profile loading, path resolution
- Key files: `config.ts` (main load/save), `schema.ts` (Zod validation entry), `zod-schema.ts` (Zod schema barrel), `types.ts` (TypeScript type barrel), `paths.ts` (config path resolution), `legacy-migrate.ts` (migration), `env-substitution.ts`, `defaults.ts`
- Pattern: Types split across `types.*.ts` files; Zod schemas split across `zod-schema.*.ts` files

**`src/channels/`:**

- Purpose: Messaging platform abstractions
- Contains: Channel plugin registry, per-platform implementations, allowlist matching, session management, coalescing
- Key files: `plugins/index.ts` (registry), `registry.ts`, `dock.ts`, `coalesce.ts`, `allowlists/`
- Subdirs: `impl/` (whatsapp, telegram, discord, slack, signal, imessage, line), `plugins/` (plugin system, config, outbound, actions), `web/` (web channel), `telegram/` (Telegram-specific)

**`src/auto-reply/`:**

- Purpose: Message processing pipeline
- Contains: Inbound processing, command detection, reply dispatching, envelope formatting, heartbeat replies, media notes, thinking/reasoning config
- Key files: `reply.ts`, `dispatch.ts`, `envelope.ts`, `command-detection.ts`, `chunk.ts`, `status.ts`, `templating.ts`
- Subdirs: `reply/` (reply dispatcher), `reply.directive.*` (model/thinking directives), `reply.triggers.*` (trigger handling)

**`src/infra/`:**

- Purpose: Infrastructure and cross-cutting utilities
- Contains: ~170 files covering networking, device identity, process management, heartbeat, Tailscale, Bonjour/mDNS, SSH, updates, exec approvals, archives, state migrations
- Key files: `dotenv.ts`, `env.ts`, `ports.ts`, `device-identity.ts`, `heartbeat-runner.ts`, `restart.ts`, `agent-events.ts`, `exec-approvals.ts`, `tailscale.ts`, `update-check.ts`

**`src/plugins/`:**

- Purpose: Plugin system for runtime extensibility
- Contains: Plugin discovery, hook runner, manifest parsing, HTTP route registration, service injection
- Key files: `discovery.ts`, `hooks.ts`, `registry.ts`, `services.ts`, `loader.ts`, `cli.ts` (CLI command registration)

**`src/memory/`:**

- Purpose: Persistent agent memory with vector search
- Contains: SQLite storage, vector embeddings (sqlite-vec), knowledge graph, embedding backends, batch operations, sync
- Key files: `manager.ts`, `sqlite.ts`, `sqlite-vec.ts`, `internal.ts`, `knowledge-graph.ts`
- Subdirs: `embedding/` (embedding providers), `search/` (search logic), `sync/` (sync operations), `batch/` (batch operations), `compaction/` (memory compaction)

**`src/security/`:**

- Purpose: Security enforcement and auditing
- Contains: Tool execution audit, command risk scoring, shell lexer, autonomy enforcement, leak detection, DM policies
- Key files: `audit.ts`, `command-risk.ts`, `autonomy-enforcement.ts`, `leak-detector.ts`, `shell-lexer.ts`

**`src/browser/`:**

- Purpose: Browser automation capabilities
- Contains: CDP client, Playwright session management, Chrome profile handling, extension relay, browser control server, AI-powered browser interaction
- Key files: `cdp.ts`, `pw-session.ts`, `pw-ai.ts`, `server.ts`, `chrome.ts`, `client.ts`

**`extensions/`:**

- Purpose: Self-contained integration packages
- Contains: ~45 extension directories, each a pnpm workspace member
- Pattern: Each has `package.json` with `"@nikolasp98/minion": "workspace:*"` dependency, `index.ts` entry point
- Built by: `scripts/build-extensions.ts` (compiles TS to JS for npm distribution)

**`skills/`:**

- Purpose: Agent skill definitions (what the AI can do)
- Contains: ~60 skill directories with manifests and scripts
- Pattern: Each skill directory contains tool definitions, scripts, or manifests describing capabilities

## Key File Locations

**Entry Points:**

- `minion.mjs`: Published npm binary entry (loads `dist/entry.js`)
- `src/entry.ts`: CLI bootstrap (respawn, profile, delegates to `src/cli/run-main.ts`)
- `src/index.ts`: Library entry (public API exports for programmatic use)
- `src/cli/run-main.ts`: CLI main runner (dotenv, routing, Commander.js parse)
- `src/gateway/server.impl.ts`: Gateway server bootstrap (`startGatewayServer()`)

**Configuration:**

- `src/config/config.ts`: Config load/save/migrate
- `src/config/paths.ts`: Config file path resolution
- `src/config/schema.ts`: Main Zod validation schema
- `src/config/zod-schema.ts`: Zod schema barrel (imports all `zod-schema.*.ts`)
- `src/config/types.ts`: TypeScript type barrel (imports all `types.*.ts`)
- `src/config/defaults.ts`: Default configuration values
- `docker/default-config.json`: Docker default config

**Core Logic:**

- `src/agents/pi-embedded-runner/run.ts`: Agent execution loop
- `src/agents/pi-embedded-subscribe.ts`: Agent stream event handler
- `src/agents/system-prompt.ts`: System prompt construction
- `src/agents/pi-tools.ts`: Tool definitions for agent
- `src/auto-reply/reply.ts`: Reply orchestration
- `src/auto-reply/dispatch.ts`: Message dispatch
- `src/gateway/server-core/server-methods.ts`: Core gateway RPC handlers
- `src/gateway/server-core/server-methods-list.ts`: RPC method registry
- `src/providers/registry.ts`: LLM provider registry
- `src/providers/model-catalog.ts`: Model catalog

**Protocol / API:**

- `src/gateway/protocol/schema.ts`: Protocol schema barrel
- `src/gateway/protocol/schema/*.ts`: Individual RPC schema files
- `src/gateway/protocol/index.ts`: Protocol public API
- `src/gateway/openai-http.ts`: OpenAI-compatible HTTP endpoint
- `src/gateway/openresponses-http.ts`: Open Responses HTTP endpoint

**Testing:**

- `vitest.config.ts`: Primary test config
- `vitest.unit.config.ts`: Unit test config
- `vitest.e2e.config.ts`: E2E test config
- `vitest.gateway.config.ts`: Gateway-specific tests
- `vitest.live.config.ts`: Live API tests
- `vitest.extensions.config.ts`: Extension tests
- `src/test-support/`: Shared test utilities
- `test/`: E2E test configuration

**Build:**

- `tsdown.config.ts`: tsdown bundler config
- `tsconfig.json`: TypeScript config
- `tsconfig.plugin-sdk.dts.json`: Plugin SDK declaration config
- `scripts/build-extensions.ts`: Extension compilation
- `scripts/write-build-info.ts`: Build metadata
- `scripts/write-cli-compat.ts`: CLI compatibility shims

## Naming Conventions

**Files:**

- `kebab-case.ts`: Standard source files (e.g., `auth-rate-limit.ts`, `pi-embedded-runner.ts`)
- `kebab-case.test.ts`: Unit tests co-located with source
- `kebab-case.e2e.test.ts`: E2E tests co-located with source
- `kebab-case.live.test.ts`: Live API tests (hit real services)
- `kebab-case.fuzz.test.ts`: Fuzz tests
- `types.*.ts`: Type definition files in config (e.g., `types.agents.ts`, `types.channels.ts`)
- `zod-schema.*.ts`: Zod validation schemas in config (e.g., `zod-schema.agents.ts`)
- `server-*.ts`: Gateway server subsystem files (e.g., `server-channels.ts`, `server-chat.ts`)
- Long descriptive test files: `pi-embedded-subscribe.subscribe-embedded-pi-session.keeps-indented-fenced-blocks-intact.e2e.test.ts`

**Directories:**

- `kebab-case/`: Standard directories
- `impl/`: Platform-specific implementations (channels)
- `plugins/`: Plugin-related code
- Flat structure preferred: Most modules are flat files, not deep directory trees

## Where to Add New Code

**New Channel Integration:**

- As extension: `extensions/<channel-name>/index.ts` + `extensions/<channel-name>/package.json`
- As built-in: `src/channels/impl/<channel-name>/` + register in `src/channels/plugins/catalog.ts`
- Config types: `src/config/types.<channel>.ts` + `src/config/zod-schema.<channel>.ts`

**New CLI Command:**

- Implementation: `src/cli/<command-name>-cli.ts`
- Registration: Add to `src/cli/program/command-registry.ts` or `src/cli/program/register.*.ts`

**New Gateway RPC Method:**

- Handler: `src/gateway/server-methods/<method-name>.ts`
- Method registration: Add to `src/gateway/server-core/server-methods-list.ts`
- Protocol schema: `src/gateway/protocol/schema/<method-name>.ts` + export from `src/gateway/protocol/schema.ts`
- Handler wiring: `src/gateway/server-core/server-methods.ts`

**New Agent Tool:**

- Tool definition: `src/agents/pi-tools.ts` or `src/agents/tools/`
- Tool policy: `src/agents/tool-policy.ts`

**New Skill:**

- Directory: `skills/<skill-name>/`
- Contains: Skill manifest and implementation scripts

**New Extension:**

- Directory: `extensions/<name>/`
- Required: `package.json` (with `"@nikolasp98/minion": "workspace:*"`), `index.ts`
- Import from: `@nikolasp98/minion/plugin-sdk` for stable API

**New Config Section:**

- TypeScript type: `src/config/types.<section>.ts` + export from `src/config/types.ts`
- Zod schema: `src/config/zod-schema.<section>.ts` + export from `src/config/zod-schema.ts`
- Defaults: `src/config/defaults.ts`
- IMPORTANT: Types, Zod schema, and runtime interfaces must stay in sync (triple-sync pattern)

**New Provider:**

- Registry entry: `src/providers/registry.ts`
- Model catalog: `src/agents/models/model-catalog.ts`
- Pricing: `src/providers/pricing.ts`

**New Hook:**

- Implementation: `src/hooks/` or `src/hooks/bundled/`
- Config: `src/config/types.hooks.ts` + `src/config/zod-schema.hooks.ts` + `src/hooks/*-types.ts` (triple-sync)

**Shared Utilities:**

- Cross-module helpers: `src/shared/`
- Infrastructure/platform: `src/infra/`

**Tests:**

- Unit tests: Co-locate as `<file>.test.ts` next to source
- E2E tests: Co-locate as `<file>.e2e.test.ts` next to source
- Test helpers: `src/test-support/` for shared utilities, or `<module>/test-helpers.ts` for module-specific

## Special Directories

**`dist/`:**

- Purpose: Compiled build output (tsdown)
- Generated: Yes
- Committed: No (in `.gitignore`)

**`node_modules/`:**

- Purpose: Dependencies
- Generated: Yes (pnpm)
- Committed: No

**`.planning/`:**

- Purpose: GSD planning documents
- Generated: By tooling
- Committed: Varies

**`setup/`:**

- Purpose: Server provisioning framework
- Generated: No
- Committed: Yes
- Key: `setup.sh` entry point, `phases/` for numbered setup steps, `templates/` for config templates

**`.github/`:**

- Purpose: CI/CD configuration
- Generated: No
- Committed: Yes
- Key: `workflows/` (CI, Docker release, npm publish), `actions/` (composite actions), `servers/` (server configs)

**`.claude/` and `.agents/`:**

- Purpose: Agent/AI assistant configuration and skills
- Generated: No
- Committed: Yes
- Key: `skills/` (fork-sync, provision-server, etc.)

**`profiles/`:**

- Purpose: CLI profile configurations
- Generated: No
- Committed: Yes

**`patches/`:**

- Purpose: pnpm patch overrides for dependencies
- Generated: No
- Committed: Yes

---

_Structure analysis: 2026-03-05_
