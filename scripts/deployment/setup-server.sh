#!/bin/bash
# OpenClaw Production Server Setup Script
# This script prepares a server for automatic OpenClaw deployment
#
# Usage: ./setup-server.sh <server-ip> [ssh-port]
#
# Example: ./setup-server.sh 100.105.147.99 22

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
SERVER_IP=""
SSH_PORT="22"
TENANT="primary"

while [[ $# -gt 0 ]]; do
    case $1 in
        --tenant)
            TENANT="$2"
            shift 2
            ;;
        *)
            if [ -z "$SERVER_IP" ]; then
                SERVER_IP="$1"
            elif [ "$1" -eq "$1" ] 2>/dev/null; then
                SSH_PORT="$1"
            fi
            shift
            ;;
    esac
done

# Configuration
DEPLOY_USER="deploy"
DEPLOYMENT_DIR="/home/deploy/openclaw-prd-${TENANT}"
CONFIG_DIR="/home/deploy/.openclaw-prd-${TENANT}"

# Validate arguments
if [ -z "$SERVER_IP" ]; then
    echo -e "${RED}Error: Server IP address required${NC}"
    echo "Usage: $0 <server-ip> [ssh-port] [--tenant <tenant-name>]"
    echo "Example: $0 100.105.147.99 22 --tenant acme"
    echo ""
    echo "Options:"
    echo "  --tenant <name>  Tenant identifier (default: primary)"
    echo "                   Must be lowercase, alphanumeric + hyphens only"
    exit 1
fi

# Validate tenant name
if ! [[ "$TENANT" =~ ^[a-z0-9-]+$ ]]; then
    echo -e "${RED}Error: Invalid tenant name${NC}"
    echo "Tenant name must be lowercase, alphanumeric + hyphens only"
    echo "Examples: acme, widgets-inc, client-123"
    exit 1
fi

echo -e "${GREEN}=== OpenClaw Production Server Setup ===${NC}"
echo "Server: $SERVER_IP:$SSH_PORT"
echo "Deploy user: $DEPLOY_USER"
echo "Tenant: $TENANT"
echo "Deployment directory: $DEPLOYMENT_DIR"
echo ""

# Check if SSH key exists
SSH_KEY_DIR="$HOME/.ssh/openclaw"
SSH_KEY_PATH="$SSH_KEY_DIR/openclaw_deploy_key"

if [ ! -f "$SSH_KEY_PATH" ]; then
    echo -e "${YELLOW}SSH key not found. Generating new deployment key...${NC}"
    mkdir -p "$SSH_KEY_DIR"
    ssh-keygen -t ed25519 -C "github-actions-openclaw-deploy" -f "$SSH_KEY_PATH" -N ""
    echo -e "${GREEN}✓ SSH key generated: $SSH_KEY_PATH${NC}"
    echo -e "${YELLOW}! Save the public key for GitHub Secrets:${NC}"
    cat "$SSH_KEY_PATH"
    echo ""
else
    echo -e "${GREEN}✓ Using existing SSH key: $SSH_KEY_PATH${NC}"
fi

# Function to run commands on remote server as root
run_as_root() {
    ssh -p "$SSH_PORT" "root@$SERVER_IP" "$@"
}

# Function to run commands on remote server as deploy user
run_as_deploy() {
    ssh -p "$SSH_PORT" "$DEPLOY_USER@$SERVER_IP" "$@"
}

echo -e "${YELLOW}Connecting to server as root...${NC}"

# Step 1: Create deploy user
echo -e "${YELLOW}Step 1/6: Creating deploy user...${NC}"
run_as_root << 'REMOTE_SCRIPT'
    if id -u deploy >/dev/null 2>&1; then
        echo "Deploy user already exists"
    else
        useradd -m -s /bin/bash deploy
        echo "Deploy user created"
    fi
    
    # Add to docker group
    if groups deploy | grep -q docker; then
        echo "Deploy user already in docker group"
    else
        usermod -aG docker deploy
        echo "Deploy user added to docker group"
    fi
REMOTE_SCRIPT
echo -e "${GREEN}✓ Deploy user configured${NC}"

# Step 2: Setup SSH keys
echo -e "${YELLOW}Step 2/6: Setting up SSH keys...${NC}"
cat "$SSH_KEY_PATH.pub" | run_as_root "su - deploy -c 'mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo \"SSH key added\"'"
echo -e "${GREEN}✓ SSH key authorized${NC}"

# Test SSH connection as deploy user
echo -e "${YELLOW}Testing SSH connection as deploy user...${NC}"
if ssh -i "$SSH_KEY_PATH" -p "$SSH_PORT" -o StrictHostKeyChecking=no "$DEPLOY_USER@$SERVER_IP" "echo 'SSH connection successful'"; then
    echo -e "${GREEN}✓ SSH connection verified${NC}"
else
    echo -e "${RED}✗ SSH connection failed${NC}"
    exit 1
fi

# Step 3: Create tenant-specific directory structure
echo -e "${YELLOW}Step 3/7: Creating tenant-specific directories...${NC}"
ssh -i "$SSH_KEY_PATH" -p "$SSH_PORT" "$DEPLOY_USER@$SERVER_IP" << REMOTE_SCRIPT
    # Create deployment directory
    mkdir -p "$DEPLOYMENT_DIR"

    # Create persistent data directories
    mkdir -p "$CONFIG_DIR"/{workspace,agents,canvas,credentials,devices,identity,media,memory,cron,sessions}
    mkdir -p ~/.config/gogcli

    echo "Directory structure created"
REMOTE_SCRIPT
echo -e "${GREEN}✓ Directories created:${NC}"
echo "  - $DEPLOYMENT_DIR"
echo "  - $CONFIG_DIR"

# Step 4: Create tenant-specific .env file template
echo -e "${YELLOW}Step 4/7: Creating tenant .env template...${NC}"
ssh -i "$SSH_KEY_PATH" -p "$SSH_PORT" "$DEPLOY_USER@$SERVER_IP" << REMOTE_SCRIPT
cat > "$DEPLOYMENT_DIR/.env" << EOF
# Docker Configuration
OPENCLAW_IMAGE=ghcr.io/nikolasp98/openclaw:prd
OPENCLAW_GATEWAY_CONTAINER_NAME=${TENANT}_openclaw_gw
OPENCLAW_CLI_CONTAINER_NAME=${TENANT}_openclaw_cli
OPENCLAW_ENV=PRD

# Paths
OPENCLAW_CONFIG_DIR=$CONFIG_DIR
OPENCLAW_WORKSPACE_DIR=$CONFIG_DIR/workspace
OPENCLAW_GOG_CONFIG_DIR=/home/deploy/.config/gogcli

# Network Configuration
OPENCLAW_GATEWAY_PORT=18789
OPENCLAW_BRIDGE_PORT=18790
OPENCLAW_GATEWAY_BIND=lan

# Authentication (REPLACE WITH SECURE VALUES)
OPENCLAW_GATEWAY_TOKEN=REPLACE_WITH_SECURE_TOKEN
CLAUDE_AI_SESSION_KEY=REPLACE_WITH_YOUR_KEY
CLAUDE_WEB_SESSION_KEY=REPLACE_WITH_YOUR_KEY
CLAUDE_WEB_COOKIE=REPLACE_WITH_YOUR_COOKIE

# Optional: Browser support
OPENCLAW_DOCKER_APT_PACKAGES=chromium fonts-liberation fonts-noto-color-emoji

# Tailscale (if using)
TAILSCALE_SOCKET=/var/run/tailscale/tailscaled.sock
TAILSCALE_BINARY=/usr/bin/tailscale
EOF
REMOTE_SCRIPT
echo -e "${GREEN}✓ .env template created${NC}"

# Step 5: Generate secure gateway token
echo -e "${YELLOW}Step 5/7: Generating secure gateway token...${NC}"
GATEWAY_TOKEN=$(openssl rand -hex 32)
ssh -i "$SSH_KEY_PATH" -p "$SSH_PORT" "$DEPLOY_USER@$SERVER_IP" << EOF
    cd "$DEPLOYMENT_DIR"
    sed -i 's/OPENCLAW_GATEWAY_TOKEN=.*/OPENCLAW_GATEWAY_TOKEN=${GATEWAY_TOKEN}/' .env
EOF
echo -e "${GREEN}✓ Gateway token generated: ${GATEWAY_TOKEN:0:12}...${NC}"
echo -e "${GREEN}✓ Token saved to .env${NC}"

# Step 6: Copy docker-compose.yml from repository
echo -e "${YELLOW}Step 6/7: Copying docker-compose.yml...${NC}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [ -f "$REPO_ROOT/docker-compose.yml" ]; then
    scp -i "$SSH_KEY_PATH" -P "$SSH_PORT" "$REPO_ROOT/docker-compose.yml" "$DEPLOY_USER@$SERVER_IP:$DEPLOYMENT_DIR/"
    echo -e "${GREEN}✓ docker-compose.yml copied${NC}"
else
    echo -e "${YELLOW}⚠ docker-compose.yml not found in repository root${NC}"
    echo "  You'll need to copy it manually or deploy via GitHub Actions"
fi

echo ""
echo -e "${GREEN}=== Server Setup Complete ===${NC}"
echo ""
echo "Next steps:"
echo "1. SSH to server: ssh -i $SSH_KEY_PATH $DEPLOY_USER@$SERVER_IP"
echo "2. Navigate to: cd $DEPLOYMENT_DIR"
echo "3. Edit .env file: nano .env"
echo "4. Add Claude credentials (CLAUDE_AI_SESSION_KEY, etc.)"
echo "5. Test manual deployment: docker compose pull && docker compose up -d"
echo "6. Add tenant to server registry: .github/servers/production.json"
echo "7. Push to PRD branch to trigger automatic deployment"
echo ""
