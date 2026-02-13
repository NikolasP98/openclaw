#!/usr/bin/env bash
# ---
# name: "Add Tenant"
# description: >
#   Interactive helper for adding a new tenant to a multi-tenant OpenClaw
#   deployment. Prompts for tenant info, runs the setup framework with
#   --tenant flag, and updates the server registry.
# when: >
#   When adding a new tenant to an existing VPS. The base setup must
#   already be complete.
# flags:
#   -v, --verbose: "Enable debug-level logging"
# idempotent: true
# ---

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SETUP_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}=== OpenClaw Tenant Addition Helper ===${NC}"
echo ""
echo "This script will guide you through adding a new tenant."
echo ""

# Prompt for tenant information
read -rp "Tenant identifier (lowercase, alphanumeric + hyphens): " TENANT
read -rp "Agent name for this tenant: " AGENT_NAME
read -rp "Anthropic API key: " API_KEY

# Optional: remote mode
read -rp "VPS hostname (leave empty for local mode): " VPS_HOST
if [ -n "$VPS_HOST" ]; then
    read -rp "SSH port (default: 22): " SSH_PORT
    SSH_PORT=${SSH_PORT:-22}
fi

read -rp "Region (e.g., us-east, eu-west): " REGION
read -rp "Human-readable tenant name: " TENANT_NAME

# Validate tenant identifier
if ! [[ "$TENANT" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]]; then
    echo -e "${RED}Error: Invalid tenant identifier${NC}"
    echo "Must be lowercase, start/end with alphanumeric, hyphens allowed in between"
    exit 1
fi

echo ""
echo -e "${BLUE}=== Configuration Summary ===${NC}"
echo "Tenant ID: $TENANT"
echo "Agent Name: $AGENT_NAME"
echo "API Key: [SET]"
if [ -n "$VPS_HOST" ]; then
    echo "VPS: $VPS_HOST:${SSH_PORT:-22}"
    echo "Mode: remote"
else
    echo "Mode: local"
fi
echo "Region: $REGION"
echo "Tenant Name: $TENANT_NAME"
echo ""

read -rp "Does this look correct? (y/n): " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Aborted."
    exit 0
fi

# Build setup command
SETUP_CMD="bash ${SETUP_DIR}/setup.sh --tenant=${TENANT} --agent-name=${AGENT_NAME} --api-key=${API_KEY}"

if [ -n "$VPS_HOST" ]; then
    SETUP_CMD="${SETUP_CMD} --vps-hostname=${VPS_HOST}"
fi

# Step 1: Run setup with tenant flag
echo ""
echo -e "${YELLOW}Step 1: Running setup for tenant '${TENANT}'...${NC}"
eval "$SETUP_CMD"

# Step 2: Show server registry update instructions
echo ""
echo -e "${YELLOW}Step 2: Update server registry${NC}"
echo ""
echo "Add this entry to .github/servers/production.json:"
echo ""
cat << EOF
{
  "id": "prd-tenant-${TENANT}",
  "host": "${VPS_HOST:-localhost}",
  "user": "openclaw-${AGENT_NAME}",
  "port": ${SSH_PORT:-22},
  "tenant": "${TENANT}",
  "region": "${REGION}"
}
EOF
echo ""

read -rp "Press Enter to open production.json in your editor..."

# Determine editor
EDITOR=${EDITOR:-nano}
if command -v code &> /dev/null; then
    EDITOR="code"
elif command -v vim &> /dev/null; then
    EDITOR="vim"
fi

"$EDITOR" "$REPO_ROOT/.github/servers/production.json"

# Step 3: Validate JSON
echo ""
echo -e "${YELLOW}Step 3: Validating JSON syntax...${NC}"
if command -v jq &> /dev/null; then
    if jq . "$REPO_ROOT/.github/servers/production.json" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ JSON is valid${NC}"
    else
        echo -e "${RED}✗ JSON syntax error${NC}"
        echo "Please fix the errors in production.json before continuing"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠ jq not installed, skipping validation${NC}"
    echo "  Install jq: sudo apt-get install jq"
fi

# Step 4: Show next steps
echo ""
echo -e "${GREEN}=== Tenant Setup Complete ===${NC}"
echo ""
echo "Next steps:"
echo ""
echo "1. Verify the deployment:"
echo "   openclaw --version"
echo "   curl http://127.0.0.1:18789/health"
echo ""
echo "2. Commit and push the registry changes:"
echo "   git add .github/servers/production.json"
echo "   git commit -m \"feat: add ${TENANT} tenant\""
echo "   git push"
echo ""
