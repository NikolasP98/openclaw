# Technology Stack

**Analysis Date:** 2026-03-05

## Languages

**Primary:**

- TypeScript (strict mode, ES2023 target) - All server, gateway, CLI, agent, and plugin code under `src/`
- Swift - Native macOS (`apps/macos/`) and iOS (`apps/ios/`) apps, shared kit (`apps/shared/OpenClawKit/`)

**Secondary:**

- Kotlin/Java - Android app (`apps/android/`)
- SQL - Database migrations (`src/db/migrations/`)
- Bash - Setup scripts (`setup/`), CI helpers, build scripts (`scripts/`)
- HTML/CSS - Control UI (`ui/`)

## Runtime

**Environment:**

- Node.js >= 22.12.0 (`.nvmrc` specifies `22`)
- Uses `node:sqlite` built-in module (experimental) for local database
- Bun installed in Docker for specific tasks

**Package Manager:**

- pnpm 10.29.3 (declared via `packageManager` field in `package.json`)
- Lockfile: `pnpm-lock.yaml` present
- UI workspace uses separate `package.json` at `ui/package.json` with `bun.lock`
- `pnpm.overrides` used for security patching: `fast-xml-parser`, `form-data`, `qs`, `tar`, `tough-cookie`

## Frameworks

**Core:**

- Express 5.2.1 - HTTP server for gateway and OpenAI-compatible API (`src/gateway/server.ts`, `src/gateway/openai-http.ts`)
- `@mariozechner/pi-agent-core` 0.53.0 - Embedded AI agent runtime (pi-embedded runner)
- `@mariozechner/pi-ai` 0.53.0 - AI model abstraction layer
- `@mariozechner/pi-coding-agent` 0.53.0 - Coding agent capabilities
- `@mariozechner/pi-tui` 0.53.0 - Terminal UI framework
- Zod 4.3.6 - Config schema validation (`src/config/zod-schema*.ts`)
- `@sinclair/typebox` 0.34.48 - JSON schema / type generation

**UI:**

- Lit 3.3.2 - Web component framework for control UI (`ui/src/`)
- Vite 7.3.1 - UI dev server and bundler (`ui/vite.config.ts`)

**Testing:**

- Vitest 4.0.18 - Unit, E2E, live, and extension tests
- fast-check 4.5.3 - Property-based / fuzz testing
- Playwright 1.58.2 - Browser automation and UI testing (`ui/`, `src/browser/`)

**Build/Dev:**

- tsdown 0.20.3 (powered by Rolldown) - Production bundler (`tsdown.config.ts`)
- tsx 4.21.0 - TypeScript execution for scripts
- TypeScript 5.9.3 - Type checking (noEmit mode, `tsconfig.json`)
- `@typescript/native-preview` 7.0.0-dev - Experimental native TS type-checker (`tsgo`)
- oxfmt 0.33.0 - Code formatter (`pnpm format`)
- oxlint 1.48.0 - Linter with type-aware rules (`pnpm lint`)

## Key Dependencies

**Critical:**

- `@whiskeysockets/baileys` 7.0.0-rc.9 - WhatsApp Web protocol client (`src/channels/impl/whatsapp/`, `src/web/`)
- `grammy` 1.40.0 - Telegram bot framework (`src/channels/impl/telegram/`)
- `@slack/bolt` 4.6.0 - Slack bot framework (`src/channels/impl/slack/`)
- `@buape/carbon` 0.14.0 - Discord bot framework (`src/channels/impl/discord/`)
- `@line/bot-sdk` 10.6.0 - LINE messaging channel (`src/channels/impl/line/`)
- `@larksuiteoapi/node-sdk` 1.59.0 - Feishu/Lark messaging (`src/channels/feishu-adapter.ts`, `extensions/feishu/`)
- `commander` 14.0.3 - CLI argument parsing (`src/cli/`)
- `ws` 8.19.0 - WebSocket server/client for gateway protocol
- `playwright-core` 1.58.2 - Browser automation for web browsing tools (`src/browser/`)

**Infrastructure:**

- `sqlite-vec` 0.1.7-alpha.2 - Vector similarity search extension for SQLite (`src/memory/sqlite-vec.ts`)
- `sharp` 0.34.5 - Image processing and resizing (`src/media/`)
- `undici` 7.22.0 - HTTP client
- `dotenv` 17.3.1 - Environment variable loading
- `chokidar` 5.0.0 - File watching for config reload
- `tslog` 4.10.2 - Structured logging (`src/logger.ts`)
- `croner` 10.0.1 - Cron scheduling
- `proper-lockfile` 4.1.2 - File-based locking
- `@lydell/node-pty` 1.2.0-beta.3 - PTY for shell tool execution
- `jiti` 2.6.1 - Runtime TypeScript/ESM import for extensions and hooks

**Media/Content:**

- `pdfjs-dist` 5.4.624 - PDF parsing
- `@mozilla/readability` 0.6.0 - Web content extraction
- `linkedom` 0.18.12 - Server-side DOM for content parsing
- `node-edge-tts` 1.2.10 - Text-to-speech via Edge TTS (`src/tts/`)
- `markdown-it` 14.1.1 - Markdown rendering
- `jszip` 3.10.1 - ZIP archive handling
- `file-type` 21.3.0 - MIME type detection

**Peer Dependencies (optional):**

- `@napi-rs/canvas` ^0.1.89 - Canvas rendering (optional)
- `node-llama-cpp` 3.15.1 - Local LLM inference via llama.cpp (optional)

## Configuration

**Environment:**

- `.env` file loading with precedence: process env > `./.env` > `~/.openclaw/.env` > config `env` block
- `.env.example` documents all supported variables
- Config file: `minion.json` (or legacy `openclaw.json`) with Zod strict validation
- Config path resolution: `~/.minion/minion.json` > `~/.minion/openclaw.json` > `~/.openclaw/minion.json` > `~/.openclaw/openclaw.json`
- Env var overrides: `OPENCLAW_CONFIG_PATH` (explicit file), `OPENCLAW_STATE_DIR` (dir to search in)
- Strict `${VAR}` substitution in config values - throws `MissingEnvVarError` if unset

**Build:**

- `tsdown.config.ts` - Production bundler config (8 entry points including plugin-sdk, hooks, extension API)
- `tsconfig.json` - TypeScript config (module: NodeNext, strict: true, noEmit: true)
- `tsconfig.plugin-sdk.dts.json` - Declaration generation for plugin SDK
- Multiple Vitest configs: `vitest.unit.config.ts`, `vitest.e2e.config.ts`, `vitest.live.config.ts`, `vitest.extensions.config.ts`, `vitest.gateway.config.ts`

**Docker:**

- `Dockerfile` - Main image based on `node:22-bookworm`
- `Dockerfile.sandbox` - Sandboxed agent execution environment
- `Dockerfile.sandbox-browser` - Browser-capable sandbox
- `Dockerfile.sandbox-common` - Shared sandbox base
- `docker-compose.yml` - Local development orchestration

## Platform Requirements

**Development:**

- Node.js 22.12.0+
- pnpm 10.29.3
- Git with custom hooks path (`git-hooks/`)
- Optional: Xcode (iOS/macOS), Android SDK (Android), Swift toolchain

**Production:**

- Node.js 22 (Docker: `node:22-bookworm`)
- SQLite support via `node:sqlite` built-in
- Optional system packages: `sqlite3`, `jq`, `ffmpeg`, `poppler-utils`
- Docker multi-arch builds (amd64, arm64)
- Deployment targets: VPS (systemd), Docker containers
- CI/CD: GitHub Actions (`ci.yml`, `docker-release.yml`, `npm-publish.yml`, `deploy-production.yml`)

---

_Stack analysis: 2026-03-05_
