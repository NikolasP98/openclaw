#!/bin/bash
# OpenClaw Production Server Setup Script
# This script prepares a server for automatic OpenClaw deployment.
# Each phase is idempotent — safe to re-run without side effects.
#
# Usage: ./setup-server.sh <server-ip> [ssh-port] [--tenant <name>]
#        [--skip-onboarding] [--credentials <path>]
#
# Examples:
#   ./setup-server.sh 100.105.147.99 22
#   ./setup-server.sh 100.105.147.99 --tenant faces
#   ./setup-server.sh 100.105.147.99 --tenant faces --credentials /tmp/faces.env
#   ./setup-server.sh 100.105.147.99 --tenant faces --skip-onboarding

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
SERVER_IP=""
SSH_PORT="22"
TENANT="primary"
SKIP_ONBOARDING=false
CREDENTIALS_PATH=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --tenant)
            TENANT="$2"
            shift 2
            ;;
        --skip-onboarding)
            SKIP_ONBOARDING=true
            shift
            ;;
        --credentials)
            CREDENTIALS_PATH="$2"
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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Source shared derivation library to compute paths from env+tenant.
# Temporarily set HOME to the remote deploy user's home so derived paths
# (OPENCLAW_CONFIG_DIR, OPENCLAW_WORKSPACE_DIR) target the server.
_SAVED_HOME="$HOME"
export OPENCLAW_ENV="prd"
export OPENCLAW_TENANT="$TENANT"
export HOME="/home/deploy"
# shellcheck source=../../scripts/lib/openclaw-env.sh
source "$REPO_ROOT/scripts/lib/openclaw-env.sh"
export HOME="$_SAVED_HOME"
unset _SAVED_HOME

DEPLOYMENT_DIR="/home/deploy/openclaw-prd-${TENANT}"
CONFIG_DIR="$OPENCLAW_CONFIG_DIR"

# Validate arguments
if [ -z "$SERVER_IP" ]; then
    echo -e "${RED}Error: Server IP address required${NC}"
    echo "Usage: $0 <server-ip> [ssh-port] [--tenant <name>] [--skip-onboarding] [--credentials <path>]"
    echo ""
    echo "Options:"
    echo "  --tenant <name>       Tenant identifier (default: primary)"
    echo "  --skip-onboarding     Skip the onboarding step (Phase 6)"
    echo "  --credentials <path>  Copy a pre-built .env file instead of generating one"
    exit 1
fi

# Validate tenant name
if ! [[ "$TENANT" =~ ^[a-z0-9-]+$ ]]; then
    echo -e "${RED}Error: Invalid tenant name${NC}"
    echo "Tenant name must be lowercase, alphanumeric + hyphens only"
    echo "Examples: acme, widgets-inc, client-123"
    exit 1
fi

# Validate credentials file if provided
if [ -n "$CREDENTIALS_PATH" ] && [ ! -f "$CREDENTIALS_PATH" ]; then
    echo -e "${RED}Error: Credentials file not found: $CREDENTIALS_PATH${NC}"
    exit 1
fi

echo -e "${GREEN}=== OpenClaw Production Server Setup ===${NC}"
echo "Server: $SERVER_IP:$SSH_PORT"
echo "Deploy user: $DEPLOY_USER"
echo "Tenant: $TENANT"
echo "Deployment directory: $DEPLOYMENT_DIR"
echo "Config directory: $CONFIG_DIR"
echo "Skip onboarding: $SKIP_ONBOARDING"
[ -n "$CREDENTIALS_PATH" ] && echo "Credentials: $CREDENTIALS_PATH"
echo ""

# Check if SSH key exists
SSH_KEY_DIR="$HOME/.ssh/openclaw"
SSH_KEY_PATH="$SSH_KEY_DIR/openclaw_deploy_key"

if [ ! -f "$SSH_KEY_PATH" ]; then
    echo -e "${YELLOW}SSH key not found. Generating new deployment key...${NC}"
    mkdir -p "$SSH_KEY_DIR"
    ssh-keygen -t ed25519 -C "github-actions-openclaw-deploy" -f "$SSH_KEY_PATH" -N ""
    echo -e "${GREEN}✓ SSH key generated: $SSH_KEY_PATH${NC}"
    echo -e "${YELLOW}! Save the private key for GitHub Secrets:${NC}"
    cat "$SSH_KEY_PATH"
    echo ""
else
    echo -e "${GREEN}✓ Using existing SSH key: $SSH_KEY_PATH${NC}"
fi

# Function to run commands on remote server as deploy user (via SSH key)
run_as_deploy() {
    ssh -i "$SSH_KEY_PATH" -p "$SSH_PORT" -o StrictHostKeyChecking=no "$DEPLOY_USER@$SERVER_IP" "$@"
}

# =========================================================================
# Phase 1 (root): Create deploy user + docker group
# =========================================================================
echo ""
echo -e "${BLUE}Phase 1/7: Creating deploy user...${NC}"
ssh -p "$SSH_PORT" "root@$SERVER_IP" << 'REMOTE_SCRIPT'
    if id -u deploy >/dev/null 2>&1; then
        echo "  Deploy user already exists — skipping"
    else
        useradd -m -s /bin/bash deploy
        echo "  Deploy user created"
    fi

    # Ensure docker group exists
    if ! getent group docker >/dev/null 2>&1; then
        groupadd docker
        echo "  Docker group created"
    fi

    # Add to docker group
    if groups deploy | grep -q docker; then
        echo "  Deploy user already in docker group — skipping"
    else
        usermod -aG docker deploy
        echo "  Deploy user added to docker group"
    fi
REMOTE_SCRIPT
echo -e "${GREEN}✓ Phase 1 complete${NC}"

# =========================================================================
# Phase 2 (root): SSH key — check fingerprint before appending
# =========================================================================
echo ""
echo -e "${BLUE}Phase 2/7: Setting up SSH keys...${NC}"
LOCAL_PUBKEY=$(cat "$SSH_KEY_PATH.pub")
LOCAL_FINGERPRINT=$(ssh-keygen -lf "$SSH_KEY_PATH.pub" | awk '{print $2}')

ssh -p "$SSH_PORT" "root@$SERVER_IP" << REMOTE_SCRIPT
    su - deploy -c '
        mkdir -p ~/.ssh && chmod 700 ~/.ssh
        touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys

        # Check if this key fingerprint is already authorized
        if ssh-keygen -lf ~/.ssh/authorized_keys 2>/dev/null | grep -q "$LOCAL_FINGERPRINT"; then
            echo "  SSH key already authorized — skipping"
        else
            echo "$LOCAL_PUBKEY" >> ~/.ssh/authorized_keys
            echo "  SSH key added"
        fi
    '
REMOTE_SCRIPT
echo -e "${GREEN}✓ Phase 2 complete${NC}"

# Test SSH connection as deploy user
echo "  Testing SSH connection as deploy user..."
if run_as_deploy "echo '  SSH connection successful'"; then
    echo -e "${GREEN}✓ SSH connection verified${NC}"
else
    echo -e "${RED}✗ SSH connection failed${NC}"
    exit 1
fi

# =========================================================================
# Phase 3 (deploy): Create top-level directories only
# =========================================================================
echo ""
echo -e "${BLUE}Phase 3/7: Creating directories...${NC}"
run_as_deploy << REMOTE_SCRIPT
    # Create deployment directory
    if [ -d "$DEPLOYMENT_DIR" ]; then
        echo "  $DEPLOYMENT_DIR already exists — skipping"
    else
        mkdir -p "$DEPLOYMENT_DIR"
        echo "  Created $DEPLOYMENT_DIR"
    fi

    # Create config directory (container entrypoint handles subdirectories)
    if [ -d "$CONFIG_DIR" ]; then
        echo "  $CONFIG_DIR already exists — skipping"
    else
        mkdir -p "$CONFIG_DIR"
        echo "  Created $CONFIG_DIR"
    fi

    # Ensure gogcli config dir exists
    mkdir -p ~/.config/gogcli
REMOTE_SCRIPT
echo -e "${GREEN}✓ Phase 3 complete${NC}"

# =========================================================================
# Phase 4 (deploy): .env — create only if missing, or use --credentials
# =========================================================================
echo ""
echo -e "${BLUE}Phase 4/7: Setting up .env...${NC}"

if [ -n "$CREDENTIALS_PATH" ]; then
    # Copy pre-built .env from credentials file
    scp -i "$SSH_KEY_PATH" -P "$SSH_PORT" "$CREDENTIALS_PATH" "$DEPLOY_USER@$SERVER_IP:$DEPLOYMENT_DIR/.env"
    echo -e "${GREEN}✓ .env copied from credentials file${NC}"
else
    run_as_deploy << REMOTE_SCRIPT
if [ -f "$DEPLOYMENT_DIR/.env" ]; then
    echo "  .env already exists — skipping (will not overwrite)"
else
    cat > "$DEPLOYMENT_DIR/.env" << ENVEOF
# Core (all other values derived from these two)
OPENCLAW_ENV=$OPENCLAW_ENV
OPENCLAW_TENANT=$OPENCLAW_TENANT

# Derived — override only for non-standard setups
OPENCLAW_IMAGE=$OPENCLAW_IMAGE
OPENCLAW_GATEWAY_CONTAINER_NAME=$OPENCLAW_GATEWAY_CONTAINER_NAME
OPENCLAW_CLI_CONTAINER_NAME=$OPENCLAW_CLI_CONTAINER_NAME
OPENCLAW_CONFIG_DIR=$OPENCLAW_CONFIG_DIR
OPENCLAW_WORKSPACE_DIR=$OPENCLAW_WORKSPACE_DIR
OPENCLAW_GOG_CONFIG_DIR=/home/deploy/.config/gogcli

# Platform constraint (prevents wrong architecture pulls)
OPENCLAW_DOCKER_PLATFORM=linux/amd64

# Network Configuration
OPENCLAW_GATEWAY_PORT=18789
OPENCLAW_BRIDGE_PORT=18790
OPENCLAW_GATEWAY_BIND=lan

# Authentication (REPLACE WITH SECURE VALUES)
OPENCLAW_GATEWAY_TOKEN=REPLACE_WITH_SECURE_TOKEN
CLAUDE_AI_SESSION_KEY=REPLACE_WITH_YOUR_KEY
CLAUDE_WEB_SESSION_KEY=REPLACE_WITH_YOUR_KEY
CLAUDE_WEB_COOKIE=REPLACE_WITH_YOUR_COOKIE

# Tailscale (if using)
TAILSCALE_SOCKET=/var/run/tailscale/tailscaled.sock
TAILSCALE_BINARY=/usr/bin/tailscale
ENVEOF
    echo "  .env template created"

    # Generate secure gateway token
    TOKEN=\$(openssl rand -hex 32)
    sed -i "s/OPENCLAW_GATEWAY_TOKEN=REPLACE_WITH_SECURE_TOKEN/OPENCLAW_GATEWAY_TOKEN=\$TOKEN/" "$DEPLOYMENT_DIR/.env"
    echo "  Gateway token generated"
fi
REMOTE_SCRIPT
fi
echo -e "${GREEN}✓ Phase 4 complete${NC}"

# =========================================================================
# Phase 5 (deploy): docker-compose.yml — always copy from repo (source of truth)
# =========================================================================
echo ""
echo -e "${BLUE}Phase 5/7: Copying docker-compose.yml...${NC}"
if [ -f "$REPO_ROOT/docker-compose.yml" ]; then
    scp -i "$SSH_KEY_PATH" -P "$SSH_PORT" "$REPO_ROOT/docker-compose.yml" "$DEPLOY_USER@$SERVER_IP:$DEPLOYMENT_DIR/"
    echo -e "${GREEN}✓ docker-compose.yml copied (always latest from repo)${NC}"
else
    echo -e "${YELLOW}⚠ docker-compose.yml not found in repository root${NC}"
    echo "  You'll need to copy it manually or deploy via GitHub Actions"
fi

# =========================================================================
# Phase 6 (deploy): Pull image + onboarding (if openclaw.json doesn't exist)
# =========================================================================
echo ""
echo -e "${BLUE}Phase 6/7: Pull image and onboarding...${NC}"

if [ "$SKIP_ONBOARDING" = true ]; then
    echo -e "${YELLOW}  Skipping onboarding (--skip-onboarding flag set)${NC}"
else
    run_as_deploy << REMOTE_SCRIPT
    cd "$DEPLOYMENT_DIR"

    echo "  Pulling images..."
    docker compose pull openclaw-gateway openclaw-cli

    if [ ! -f "$CONFIG_DIR/openclaw.json" ]; then
        echo "  Running non-interactive onboarding..."
        docker compose run --rm openclaw-cli onboard \
            --non-interactive --accept-risk --flow quickstart --mode local \
            --auth-choice skip --gateway-bind lan \
            --skip-channels --skip-skills --skip-daemon --skip-ui --skip-health
        echo "  Onboarding complete"
    else
        echo "  openclaw.json already exists — skipping onboarding"
    fi
REMOTE_SCRIPT
fi
echo -e "${GREEN}✓ Phase 6 complete${NC}"

# =========================================================================
# Phase 7 (deploy): Start services + health check + data symlink
# =========================================================================
echo ""
echo -e "${BLUE}Phase 7/7: Starting services...${NC}"
run_as_deploy << REMOTE_SCRIPT
    cd "$DEPLOYMENT_DIR"

    # Create data symlink for convenience
    ln -sfn "$CONFIG_DIR" "$DEPLOYMENT_DIR/data"

    # Start services
    docker compose up -d
    echo "  Containers started, waiting for initialization..."
    sleep 15

    # Health check
    CONTAINER_NAME="$OPENCLAW_GATEWAY_CONTAINER_NAME"
    if docker compose ps 2>/dev/null | grep -q "\${CONTAINER_NAME}.*Up"; then
        echo "  Gateway container is running"
    else
        echo "  WARNING: Gateway container may not be running"
        docker compose ps
    fi
REMOTE_SCRIPT
echo -e "${GREEN}✓ Phase 7 complete${NC}"

echo ""
echo -e "${GREEN}=== Server Setup Complete ===${NC}"
echo ""
echo "Next steps:"
echo "1. SSH to server: ssh -i $SSH_KEY_PATH $DEPLOY_USER@$SERVER_IP"
echo "2. Navigate to: cd $DEPLOYMENT_DIR"
echo "3. Edit .env file: nano .env"
echo "4. Add Claude credentials (CLAUDE_AI_SESSION_KEY, etc.)"
echo "5. Verify deployment: docker compose ps"
echo "6. Add tenant to server registry: .github/servers/production.json"
echo "7. Push to PRD branch to trigger automatic deployment"
echo ""
echo "Useful paths:"
echo "  Deployment: $DEPLOYMENT_DIR"
echo "  Config:     $CONFIG_DIR"
echo "  Symlink:    $DEPLOYMENT_DIR/data -> $CONFIG_DIR"
