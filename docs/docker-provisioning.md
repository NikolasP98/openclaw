# Docker Provisioning Setup

This guide explains how to use the automated agent provisioning system with Docker.

## Overview

The provisioning system allows you to programmatically create and configure OpenClaw agents via HTTP API, with optional auto-provisioning of AI API keys.

## Quick Start

### 1. Enable Provisioning

Add to your `.env` file:

```bash
OPENCLAW_PROVISIONING_ENABLED=true
OPENCLAW_GATEWAY_TOKEN=your-gateway-token-here
```

### 2. Start the Gateway

```bash
docker-compose up -d openclaw-gateway
```

### 3. Initialize Provisioning Keys

Run the initialization script inside the container:

```bash
docker exec openclaw-gateway /bin/bash /app/scripts/docker-init-provisioning.sh
```

This will generate an agent provisioning key and display it. **Save this key securely!**

### 4. Create an Agent via API

```bash
curl -X POST http://localhost:18789/api/v1/agents/create \
  -H "Authorization: Bearer ${OPENCLAW_GATEWAY_TOKEN}" \
  -H "X-Agent-Provisioning-Key: ${AGENT_PROVISIONING_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-agent",
    "workspace": "/home/node/.openclaw/workspace-my-agent",
    "model": "claude-sonnet-3.5"
  }'
```

## Auto-Provisioning AI Keys

To automatically provision AI API keys for new agents:

### 1. Add Master AI Provider Key

```bash
# For Anthropic (when API available)
docker exec openclaw-gateway node dist/index.js provisioning ai-providers add \
  --provider anthropic \
  --name "Master Anthropic Key" \
  --key "${ANTHROPIC_MASTER_KEY}"

# For OpenAI
docker exec openclaw-gateway node dist/index.js provisioning ai-providers add \
  --provider openai \
  --name "Master OpenAI Key" \
  --key "${OPENAI_MASTER_KEY}"
```

### 2. Create Agent Provisioning Key Linked to AI Provider

```bash
# Get the AI provider key ID
AI_PROVIDER_KEY_ID=$(docker exec openclaw-gateway node dist/index.js provisioning ai-providers list --json | jq -r '.keys[0].id')

# Create linked agent provisioning key
docker exec openclaw-gateway node dist/index.js provisioning agent-keys create \
  --name "Auto-provisioning key" \
  --scopes "agents:create,agents:onboard" \
  --ai-provider-key "${AI_PROVIDER_KEY_ID}"
```

### 3. Create Agent with Auto-Provisioned AI Key

```bash
curl -X POST http://localhost:18789/api/v1/agents/create \
  -H "Authorization: Bearer ${OPENCLAW_GATEWAY_TOKEN}" \
  -H "X-Agent-Provisioning-Key: ${AGENT_PROVISIONING_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "auto-agent",
    "workspace": "/home/node/.openclaw/workspace-auto",
    "model": "claude-sonnet-3.5",
    "autoProvisionAiKey": {
      "provider": "anthropic",
      "quotas": {
        "maxTokensPerMonth": 1000000
      }
    }
  }'
```

The agent will be created with its own dedicated AI API key!

## API Endpoints

### POST /api/v1/agents/create
Create a new agent.

**Headers:**
- `Authorization: Bearer <gateway-token>`
- `X-Agent-Provisioning-Key: <provisioning-key>`

**Body:**
```json
{
  "name": "my-agent",
  "workspace": "/home/node/.openclaw/workspace-my-agent",
  "model": "claude-sonnet-3.5",
  "bind": ["telegram:*"],
  "autoProvisionAiKey": {
    "provider": "anthropic",
    "quotas": {
      "maxTokensPerMonth": 1000000
    }
  }
}
```

### GET /api/v1/agents
List all configured agents.

**Headers:**
- `Authorization: Bearer <gateway-token>`

### GET /api/v1/agents/:id
Get agent status and health.

**Headers:**
- `Authorization: Bearer <gateway-token>`

### DELETE /api/v1/agents/:id
Delete an agent.

**Note:** Requires `gateway.provisioning.allowDelete: true` in config.

**Headers:**
- `Authorization: Bearer <gateway-token>`
- `X-Agent-Provisioning-Key: <provisioning-key>` (must have `agents:delete` scope)

**Body:**
```json
{
  "deleteWorkspace": true,
  "deleteSessions": true
}
```

### POST /api/v1/agents/:id/onboard
Configure authentication for an agent.

**Headers:**
- `Authorization: Bearer <gateway-token>`
- `X-Agent-Provisioning-Key: <provisioning-key>` (must have `agents:onboard` scope)

**Body:**
```json
{
  "steps": ["auth"],
  "auth": {
    "provider": "anthropic",
    "credentials": {
      "apiKey": "sk-ant-..."
    },
    "model": "claude-sonnet-3.5"
  }
}
```

## CLI Commands

### AI Provider Keys

```bash
# Add AI provider key
docker exec openclaw-gateway node dist/index.js provisioning ai-providers add \
  --provider anthropic \
  --name "Master Key" \
  --key "sk-ant-..."

# List AI provider keys
docker exec openclaw-gateway node dist/index.js provisioning ai-providers list

# Revoke AI provider key
docker exec openclaw-gateway node dist/index.js provisioning ai-providers revoke <key-id>
```

### Agent Provisioning Keys

```bash
# Create agent provisioning key
docker exec openclaw-gateway node dist/index.js provisioning agent-keys create \
  --name "Docker automation" \
  --scopes "agents:create,agents:onboard"

# Create with AI provider link
docker exec openclaw-gateway node dist/index.js provisioning agent-keys create \
  --name "Auto-provisioning" \
  --scopes "agents:create,agents:onboard" \
  --ai-provider-key <provider-key-id>

# List agent provisioning keys
docker exec openclaw-gateway node dist/index.js provisioning agent-keys list

# Revoke agent provisioning key
docker exec openclaw-gateway node dist/index.js provisioning agent-keys revoke <key-id>

# Rotate agent provisioning key
docker exec openclaw-gateway node dist/index.js provisioning agent-keys rotate <key-id>
```

## Configuration

Add to your OpenClaw config file (`~/.openclaw/config.json`):

```json
{
  "gateway": {
    "provisioning": {
      "enabled": true,
      "basePath": "/api/v1",
      "maxAgentsPerKey": 100,
      "rateLimitPerMinute": 10,
      "allowDelete": false
    }
  }
}
```

## Security

- **Rate Limiting:** Default 10 requests/minute per key (configurable)
- **Audit Logging:** All operations logged to `~/.openclaw/provisioning/audit.jsonl`
- **Constant-Time Validation:** Keys validated using timing-safe comparison
- **File Permissions:** All key files stored with 0600 permissions
- **Dual Authentication:** Both gateway token and provisioning key required

## Storage

Provisioning data is stored in:

```
~/.openclaw/provisioning/
├── ai-providers.json       # AI provider master keys
├── keys.json              # Agent provisioning keys
├── ai-key-mappings.json   # Agent → AI key mappings
└── audit.jsonl            # Audit log
```

## Troubleshooting

### Check Provisioning Status

```bash
# View audit log
docker exec openclaw-gateway cat /home/node/.openclaw/provisioning/audit.jsonl

# List keys
docker exec openclaw-gateway node dist/index.js provisioning agent-keys list
docker exec openclaw-gateway node dist/index.js provisioning ai-providers list
```

### Enable Debug Logging

Add to your config:

```json
{
  "logging": {
    "level": "debug"
  }
}
```

### Test API Connectivity

```bash
curl http://localhost:18789/api/v1/agents \
  -H "Authorization: Bearer ${OPENCLAW_GATEWAY_TOKEN}"
```
