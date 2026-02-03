#!/bin/bash
# Docker Provisioning Initialization Script
#
# Generates provisioning keys on first run if they don't exist.
# This script should be run inside the Docker container.

set -e

PROVISION_KEYS_FILE="/home/node/.openclaw/provisioning/keys.json"
AI_PROVIDER_KEYS_FILE="/home/node/.openclaw/provisioning/ai-providers.json"

echo "OpenClaw Provisioning Initialization"
echo "===================================="
echo ""

# Check if provisioning is enabled
if [ "${OPENCLAW_PROVISIONING_ENABLED}" != "true" ]; then
  echo "Provisioning is disabled (OPENCLAW_PROVISIONING_ENABLED != true)"
  exit 0
fi

# Check if agent provisioning keys already exist
if [ -f "$PROVISION_KEYS_FILE" ]; then
  echo "Agent provisioning keys already exist at: $PROVISION_KEYS_FILE"
  echo "Use CLI commands to manage keys:"
  echo "  node dist/index.js provisioning agent-keys list"
  echo "  node dist/index.js provisioning agent-keys create --scopes agents:create --name 'Docker auto'"
  exit 0
fi

echo "No provisioning keys found. Generating initial setup..."
echo ""

# Create directories
mkdir -p "$(dirname "$PROVISION_KEYS_FILE")"
mkdir -p "$(dirname "$AI_PROVIDER_KEYS_FILE")"

# Generate initial agent provisioning key
echo "Generating agent provisioning key..."
PROVISION_KEY=$(node dist/index.js provisioning agent-keys create \
  --name "Docker auto-generated" \
  --scopes "agents:create,agents:onboard" \
  --output-key-only)

echo ""
echo "===================================="
echo "SAVE THIS PROVISIONING KEY:"
echo ""
echo "$PROVISION_KEY"
echo ""
echo "===================================="
echo ""
echo "Set this key as an environment variable:"
echo "  export OPENCLAW_AGENT_PROVISIONING_KEY=\"$PROVISION_KEY\""
echo ""
echo "Or add it to your .env file:"
echo "  OPENCLAW_AGENT_PROVISIONING_KEY=$PROVISION_KEY"
echo ""
echo "You can now create agents via the API:"
echo "  curl -X POST http://localhost:18789/api/v1/agents/create \\"
echo "    -H 'Authorization: Bearer \${OPENCLAW_GATEWAY_TOKEN}' \\"
echo "    -H 'X-Agent-Provisioning-Key: $PROVISION_KEY' \\"
echo "    -d '{\"name\":\"my-agent\",\"workspace\":\"/home/node/.openclaw/workspace-my-agent\"}'"
echo ""
echo "===================================="
echo ""

# Optional: Generate AI provider key if master key is provided
if [ -n "${ANTHROPIC_MASTER_KEY}" ]; then
  echo "ANTHROPIC_MASTER_KEY detected. Adding AI provider key..."
  node dist/index.js provisioning ai-providers add \
    --provider anthropic \
    --name "Docker Anthropic Master" \
    --key "${ANTHROPIC_MASTER_KEY}"
  echo "AI provider key added successfully."
  echo ""
fi

if [ -n "${OPENAI_MASTER_KEY}" ]; then
  echo "OPENAI_MASTER_KEY detected. Adding AI provider key..."
  node dist/index.js provisioning ai-providers add \
    --provider openai \
    --name "Docker OpenAI Master" \
    --key "${OPENAI_MASTER_KEY}"
  echo "AI provider key added successfully."
  echo ""
fi

echo "Provisioning initialization complete!"
