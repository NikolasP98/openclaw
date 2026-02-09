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

# Configuration
SERVER_IP=${1:-}
SSH_PORT=${2:-22}
DEPLOY_USER="deploy"
DEPLOYMENT_DIR="/home/deploy/openclaw-prd"

# Validate arguments
if [ -z "$SERVER_IP" ]; then
    echo -e "${RED}Error: Server IP address required${NC}"
    echo "Usage: $0 <server-ip> [ssh-port]"
    echo "Example: $0 100.105.147.99 22"
    exit 1
fi

echo -e "${GREEN}=== OpenClaw Production Server Setup ===${NC}"
echo "Server: $SERVER_IP:$SSH_PORT"
echo "Deploy user: $DEPLOY_USER"
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

# Step 3: Create directory structure
echo -e "${YELLOW}Step 3/6: Creating directory structure...${NC}"
ssh -i "$SSH_KEY_PATH" -p "$SSH_PORT" "$DEPLOY_USER@$SERVER_IP" << 'REMOTE_SCRIPT'
    # Create deployment directory
    mkdir -p ~/openclaw-prd
    
    # Create persistent data directories
    mkdir -p ~/.openclaw-prd/{workspace,agents,canvas,credentials,devices,identity,media,memory,cron,sessions}
    mkdir -p ~/.config/gogcli
    
    echo "Directory structure created"
REMOTE_SCRIPT
echo -e "${GREEN}✓ Directories created${NC}"

# Step 4: Create production .env file template
echo -e "${YELLOW}Step 4/6: Creating production .env template...${NC}"
ssh -i "$SSH_KEY_PATH" -p "$SSH_PORT" "$DEPLOY_USER@$SERVER_IP" << 'REMOTE_SCRIPT'
cat > ~/openclaw-prd/.env << 'EOF'
# Docker Configuration
OPENCLAW_IMAGE=ghcr.io/nikolasp98/openclaw:prd
OPENCLAW_GATEWAY_CONTAINER_NAME=openclaw_PRD_gw
OPENCLAW_CLI_CONTAINER_NAME=openclaw_PRD_cli
OPENCLAW_ENV=PRD

# Paths
OPENCLAW_CONFIG_DIR=/home/deploy/.openclaw-prd
OPENCLAW_WORKSPACE_DIR=/home/deploy/.openclaw-prd/workspace
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
