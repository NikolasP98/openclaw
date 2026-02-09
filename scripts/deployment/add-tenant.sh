#!/bin/bash
# OpenClaw Tenant Addition Helper
# This script helps you add a new tenant to the multi-server deployment
#
# Usage: ./add-tenant.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== OpenClaw Tenant Addition Helper ===${NC}"
echo ""
echo "This script will guide you through adding a new tenant."
echo ""

# Prompt for tenant information
read -p "Tenant identifier (lowercase, alphanumeric + hyphens): " TENANT
read -p "Server IP address: " SERVER_IP
read -p "SSH port (default: 22): " SSH_PORT
SSH_PORT=${SSH_PORT:-22}
read -p "Region (e.g., us-east, eu-west): " REGION
read -p "Human-readable tenant name: " TENANT_NAME

# Validate tenant identifier
if ! [[ "$TENANT" =~ ^[a-z0-9-]+$ ]]; then
    echo -e "${RED}Error: Invalid tenant identifier${NC}"
    echo "Must be lowercase, alphanumeric + hyphens only"
    exit 1
fi

echo ""
echo -e "${BLUE}=== Configuration Summary ===${NC}"
echo "Tenant ID: $TENANT"
echo "Server IP: $SERVER_IP:$SSH_PORT"
echo "Region: $REGION"
echo "Tenant Name: $TENANT_NAME"
echo ""

read -p "Does this look correct? (y/n): " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Aborted."
    exit 0
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Step 1: Run setup-server.sh
echo ""
echo -e "${YELLOW}Step 1: Running server setup script...${NC}"
if [ ! -f "$SCRIPT_DIR/setup-server.sh" ]; then
    echo -e "${RED}Error: setup-server.sh not found${NC}"
    exit 1
fi

chmod +x "$SCRIPT_DIR/setup-server.sh"
"$SCRIPT_DIR/setup-server.sh" "$SERVER_IP" "$SSH_PORT" --tenant "$TENANT"

# Step 2: Open production.json for editing
echo ""
echo -e "${YELLOW}Step 2: Add tenant to server registry${NC}"
echo ""
echo "Add this entry to .github/servers/production.json:"
echo ""
cat << EOF
{
  "id": "prd-tenant-${TENANT}",
  "host": "${SERVER_IP}",
  "user": "deploy",
  "port": ${SSH_PORT},
  "deployment_path": "/home/deploy/openclaw-prd-${TENANT}",
  "container_prefix": "${TENANT}",
  "gateway_port": 18789,
  "bridge_port": 18790,
  "tenant": "${TENANT_NAME}",
  "region": "${REGION}"
}
EOF
echo ""

read -p "Press Enter to open production.json in your editor..."

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
echo "1. SSH to server and configure credentials:"
echo "   ssh -i ~/.ssh/openclaw/openclaw_deploy_key deploy@${SERVER_IP}"
echo "   cd ~/openclaw-prd-${TENANT}"
echo "   nano .env  # Add CLAUDE_AI_SESSION_KEY, etc."
echo "   docker compose pull && docker compose up -d  # Test deployment"
echo "   exit"
echo ""
echo "2. Commit and push the registry changes:"
echo "   git add .github/servers/production.json"
echo "   git commit -m \"feat: add ${TENANT} tenant\""
echo "   git push origin PRD"
echo ""
echo "3. Monitor deployment in GitHub Actions:"
echo "   https://github.com/$(git config --get remote.origin.url | sed 's/.*://; s/.git$//')/actions"
echo ""
echo "4. Verify deployment:"
echo "   ssh -i ~/.ssh/openclaw/openclaw_deploy_key deploy@${SERVER_IP}"
echo "   cd ~/openclaw-prd-${TENANT}"
echo "   docker compose ps"
echo "   curl http://localhost:18789/health"
echo ""
