# External Integrations

**Analysis Date:** 2026-03-05

## APIs & External Services

**LLM Providers (via `src/providers/registry.ts`):**

- Anthropic (Claude) - Primary AI provider
  - SDK/Client: `@mariozechner/pi-ai` (OpenAI-compatible + native Anthropic API)
  - Auth: `ANTHROPIC_API_KEY` / `ANTHROPIC_API_KEYS` (comma-separated rotation)
  - Base: `https://api.anthropic.com`
- OpenAI (GPT, o1, o3, o4) - AI provider
  - SDK/Client: OpenAI-compatible HTTP
  - Auth: `OPENAI_API_KEY` / `OPENAI_API_KEYS`
  - Base: `https://api.openai.com`
- Google (Gemini) - AI provider
  - SDK/Client: Google Generative Language API
  - Auth: `GOOGLE_API_KEY` / `GEMINI_API_KEY` / `GEMINI_API_KEYS`
  - Base: `https://generativelanguage.googleapis.com`
- Groq - Fast inference
  - Auth: `GROQ_API_KEY`
  - Base: `https://api.groq.com`
- Mistral AI - AI provider
  - Auth: `MISTRAL_API_KEY`
  - Base: `https://api.mistral.ai`
- DeepSeek - AI provider
  - Auth: `DEEPSEEK_API_KEY`
  - Base: `https://api.deepseek.com`
- xAI (Grok) - AI provider
  - Auth: `XAI_API_KEY`
  - Base: `https://api.x.ai`
- OpenRouter - Multi-model gateway/router
  - Auth: `OPENROUTER_API_KEY`
  - Base: `https://openrouter.ai/api`
- Together AI - Inference provider
  - Auth: `TOGETHER_API_KEY`
  - Base: `https://api.together.xyz`
- AWS Bedrock - Cloud AI
  - SDK/Client: `@aws-sdk/client-bedrock`
  - Auth: `AWS_ACCESS_KEY_ID` + AWS credential chain
- GitHub Copilot - Auth proxy (`src/providers/github-copilot-auth.ts`, `src/providers/github-copilot-models.ts`)

**Local LLM Providers:**

- Ollama - Local inference at `http://127.0.0.1:11434`
- LM Studio - Local inference at `http://127.0.0.1:1234`
- vLLM - Local inference at `http://127.0.0.1:8000`
- node-llama-cpp (peer dep) - In-process llama.cpp inference

**Additional Model Providers:**

- ZAI: `ZAI_API_KEY`
- AI Gateway: `AI_GATEWAY_API_KEY`
- MiniMax: `MINIMAX_API_KEY` (portal auth at `extensions/minimax-portal-auth/`)
- Synthetic: `SYNTHETIC_API_KEY`
- Chutes: OAuth-based (`src/agents/chutes-oauth.ts`)
- Qwen Portal: OAuth-based (`src/providers/qwen-portal-oauth.ts`, `extensions/qwen-portal-auth/`)

## Messaging Channels

**Built-in Channel Implementations (`src/channels/impl/`):**

- WhatsApp - Via Baileys library (Web protocol)
  - Client: `@whiskeysockets/baileys`
  - Auth: QR code pairing, session persistence
  - Files: `src/channels/impl/whatsapp/`, `src/web/`
- Telegram - Via Grammy bot framework
  - Client: `grammy` + `@grammyjs/runner`
  - Auth: `TELEGRAM_BOT_TOKEN`
  - Files: `src/channels/impl/telegram/`, `src/channels/telegram/`
- Discord - Via Carbon framework
  - Client: `@buape/carbon`, `discord-api-types`
  - Auth: `DISCORD_BOT_TOKEN`
  - Files: `src/channels/impl/discord/`
- Slack - Via Bolt framework
  - Client: `@slack/bolt`, `@slack/web-api`
  - Auth: `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`
  - Files: `src/channels/impl/slack/`
- LINE - Via official SDK
  - Client: `@line/bot-sdk`
  - Files: `src/channels/impl/line/`
- Signal - Via signal-cli bridge
  - Files: `src/channels/impl/signal/`
- iMessage - Via macOS bridge
  - Files: `src/channels/impl/imessage/`

**Extension-based Channels (`extensions/`):**

- Feishu/Lark (`extensions/feishu/`) - `@larksuiteoapi/node-sdk`
- Google Chat (`extensions/googlechat/`)
- Matrix (`extensions/matrix/`)
- Mattermost (`extensions/mattermost/`) - `MATTERMOST_BOT_TOKEN`, `MATTERMOST_URL`
- MS Teams (`extensions/msteams/`)
- Nextcloud Talk (`extensions/nextcloud-talk/`)
- IRC (`extensions/irc/`)
- Nostr (`extensions/nostr/`)
- Twitch (`extensions/twitch/`) - `OPENCLAW_TWITCH_ACCESS_TOKEN`
- Tlon (`extensions/tlon/`)
- Zalo (`extensions/zalo/`, `extensions/zalouser/`) - `ZALO_BOT_TOKEN`
- WATI (`extensions/wati/`) - WhatsApp Business API
- BlueBubbles (`extensions/bluebubbles/`) - iMessage bridge alternative

## Data Storage

**Databases:**

- SQLite (via `node:sqlite` built-in)
  - Client: Native Node.js SQLite module (`src/memory/sqlite.ts`)
  - Migrations: `src/db/migrations/001_typed_memory.sql`
  - Vector search: `sqlite-vec` extension (`src/memory/sqlite-vec.ts`)
  - Purpose: Conversation memory, embeddings, knowledge graph
  - Files: `src/memory/manager.ts`, `src/memory/index.ts`

**File Storage:**

- Local filesystem only
  - State directory: `~/.minion/` (or `~/.openclaw/`)
  - Session files: `src/memory/session-files.ts`
  - Config files: `src/config/paths.ts`

**Caching:**

- In-memory caching (manager cache keys at `src/memory/manager-cache-key.ts`)
- Prompt caching: `src/agents/prompt-cache.ts`
- Auth profile caching: `src/agents/auth-profiles/`

## Authentication & Identity

**Gateway Auth:**

- Token-based: `OPENCLAW_GATEWAY_TOKEN` (env) / `gateway.auth.token` (config)
- Password-based: `OPENCLAW_GATEWAY_PASSWORD` (alternative)
- WebSocket auth via protocol handshake
- Files: `src/gateway/auth/`, `src/gateway/server-core/`

**Channel Auth:**

- Per-channel tokens and OAuth flows
- WhatsApp: QR code pairing with session persistence (`src/web/login-qr.ts`)
- Slack: Bot token + App token
- Discord: Bot token
- Telegram: Bot token

**Browser Control Auth:**

- Chrome extension relay (`src/browser/extension-relay.ts`)
- Bridge server auth registry (`src/browser/bridge-auth-registry.ts`)
- Control auth with auto-token (`src/browser/control-auth.ts`)
- CSRF protection (`src/browser/csrf.ts`)

**External Auth Integrations:**

- Google OAuth (Gmail, Calendar, Drive) - `src/hooks/gog-oauth-server.ts`, `extensions/google-antigravity-auth/`
- GitHub Copilot token management - `src/providers/github-copilot-token.ts`
- Google Gemini CLI auth - `extensions/google-gemini-cli-auth/`
- OpenAI Codex auth - `extensions/openai-codex-auth/`
- Notion auth - `extensions/notion-auth/`

## Monitoring & Observability

**Error Tracking:**

- None (no Sentry or similar detected)

**Logs:**

- `tslog` structured logging (`src/logger.ts`)
- Gateway WebSocket logging: `src/gateway/ws-log.ts`, `src/gateway/ws-logging.ts`
- Plugin logging: `src/plugins/logger.ts`
- Log files written to `~/.minion/logs/`

**Metrics:**

- Prometheus metrics endpoint: `src/gateway/prometheus-metrics.ts`
- Hub metrics push: `src/gateway/hub-metrics-push.ts`
- Channel health monitor: `src/gateway/channel-health-monitor.ts`
- Model health check: `src/gateway/model-health-check.ts`

**Diagnostics:**

- OpenTelemetry extension: `extensions/diagnostics-otel/`

## CI/CD & Deployment

**Hosting:**

- Self-hosted VPS (systemd services)
- Docker containers (multi-arch: amd64, arm64)
- Tailscale serve mode for remote access

**CI Pipeline:**

- GitHub Actions
  - `ci.yml` - Build, lint, test (unit + E2E), type-check, multi-platform
  - `docker-release.yml` - Docker image builds on push to DEV/main
  - `npm-publish.yml` - Publish `@nikolasp98/minion` to npm (main=latest, DEV=dev tag)
  - `deploy-production.yml` - Production deployment after Docker release
  - `install-smoke.yml` - Installation smoke tests

**Docker Tags:**

- `DEV` branch -> `dev` tag
- `main` branch -> `prd` tag
- `mirror` branch -> `mirror` tag

## Tools & Search Integrations

**Web Search:**

- Brave Search API: `BRAVE_API_KEY`
- Perplexity API: `PERPLEXITY_API_KEY`
- Firecrawl API: `FIRECRAWL_API_KEY`

**Voice/Audio:**

- ElevenLabs TTS: `ELEVENLABS_API_KEY` / `XI_API_KEY`
- Deepgram STT: `DEEPGRAM_API_KEY`
- Edge TTS: `node-edge-tts` (no API key needed)
- Voice call extension: `extensions/voice-call/`
- Talk voice extension: `extensions/talk-voice/`

**Browser Automation:**

- Playwright Core - Headless/headed browser control (`src/browser/`)
- Chrome DevTools Protocol (CDP) - Direct browser automation (`src/browser/cdp.ts`)
- Chrome extension relay - Tab-based browser control

**Content Processing:**

- PDF.js - PDF text extraction (`pdfjs-dist`)
- Readability - Web article extraction (`@mozilla/readability`)
- Sharp - Image resize/conversion

**External CLI Tools (Docker):**

- `gh` - GitHub CLI
- `obsidian-cli` - Obsidian vault management
- `gogcli` - Google services CLI (Gmail/GCal/GDrive)
- `ffmpeg` - Video/audio processing

## Webhooks & Callbacks

**Incoming:**

- Telegram webhook endpoint (configurable)
- Slack events API (via Bolt socket mode or HTTP)
- LINE webhook endpoint
- Feishu/Lark event subscriptions
- Google Chat webhook
- MS Teams webhook
- OpenAI-compatible chat completions endpoint: `src/gateway/openai-http.ts`
- Open Responses HTTP endpoint: `src/gateway/openresponses-http.ts`

**Outgoing:**

- Hub metrics push: `src/gateway/hub-metrics-push.ts`
- Gmail watch/push notifications: `src/hooks/gmail-watcher.ts`
- Google OAuth callback notifications: `src/hooks/gog-oauth-notifications.ts`

## Protocol & API Compatibility

**Agent Client Protocol:**

- `@agentclientprotocol/sdk` 0.14.1 - Standard agent protocol support

**OpenAI API Compatibility:**

- Chat completions endpoint (`src/gateway/openai-http.ts`)
- Open Responses format (`src/gateway/openresponses-http.ts`)
- Protocol schema generation: `scripts/protocol-gen.ts`

**Gateway WebSocket Protocol:**

- Custom binary/JSON protocol over WebSocket (`src/gateway/protocol/`)
- Schema definitions: `src/gateway/protocol/schema/`
- Swift protocol codegen: `scripts/protocol-gen-swift.ts`

## mDNS / Service Discovery

**Local Network:**

- `@homebridge/ciao` 1.3.5 - mDNS/Bonjour service advertisement for local gateway discovery

## Environment Configuration

**Required env vars (minimum):**

- At least one LLM provider API key (e.g., `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`)
- `OPENCLAW_GATEWAY_TOKEN` if gateway binds beyond loopback

**Optional env vars:**

- Channel tokens (Telegram, Discord, Slack, etc.)
- Tool API keys (Brave, Perplexity, ElevenLabs, Deepgram)
- `OPENCLAW_STATE_DIR`, `OPENCLAW_CONFIG_PATH` for custom paths
- `NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt` on Debian with Node 22

**Secrets location:**

- `.env` file (local dev, gitignored)
- `~/.minion/.env` (production systemd EnvironmentFile)
- Config file `minion.json` with `${VAR}` substitution for secrets

---

_Integration audit: 2026-03-05_
