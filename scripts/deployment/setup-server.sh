#!/bin/bash
#
# OpenClaw Production Server Setup Script
#
# This script prepares a production server for automatic deployment.
# Run this on the server as root or with sudo privileges.
#
# Usage:
#   ./setup-server.sh [tenant-name] [public-key-path]
#
# Example:
#   ./setup-server.sh acme-corp ~/.ssh/openclaw_deploy_key.pub
#

set -e

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root or with sudo"
   exit 1
fi

# Parse arguments
TENANT_NAME="${1:-default}"
PUBLIC_KEY_PATH="${2}"

if [[ -z "$PUBLIC_KEY_PATH" ]]; then
    echo "Usage: $0 <tenant-name> <public-key-path>"
    echo "Example: $0 acme-corp ~/.ssh/openclaw_deploy_key.pub"
    exit 1
fi

if [[ ! -f "$PUBLIC_KEY_PATH" ]]; then
    echo "Error: Public key file not found: $PUBLIC_KEY_PATH"
    exit 1
fi

echo "=== OpenClaw Production Server Setup ==="
echo "Tenant: $TENANT_NAME"
echo "Public Key: $PUBLIC_KEY_PATH"
echo ""

# 1. Create deploy user
echo "[1/7] Creating deploy user..."
if id "deploy" &>/dev/null; then
    echo "User 'deploy' already exists, skipping..."
else
    useradd -m -s /bin/bash deploy
    echo "User 'deploy' created"
fi

# 2. Add deploy user to docker group
echo "[2/7] Adding deploy user to docker group..."
usermod -aG docker deploy
echo "Deploy user added to docker group"

# 3. Setup SSH directory and authorized_keys
echo "[3/7] Setting up SSH directory..."
su - deploy -c "mkdir -p ~/.ssh && chmod 700 ~/.ssh"

if su - deploy -c "test -f ~/.ssh/authorized_keys"; then
    echo "authorized_keys already exists"
else
    su - deploy -c "touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
fi

# 4. Add public key
echo "[4/7] Adding public key to authorized_keys..."
cat "$PUBLIC_KEY_PATH" | su - deploy -c "cat >> ~/.ssh/authorized_keys"
echo "Public key added"

# 5. Create deployment directory structure
echo "[5/7] Creating deployment directory structure..."
su - deploy << 'EOSCRIPT'
    mkdir -p ~/openclaw-prd
    mkdir -p ~/.openclaw-prd/{workspace,agents,canvas,credentials,devices,identity,media,memory,cron,sessions}
    mkdir -p ~/.config/gogcli
    echo "Deployment directories created"
EOSCRIPT

# 6. Create template .env file
echo "[6/7] Creating template .env file..."
su - deploy << 'EOSCRIPT'
cat > ~/openclaw-prd/.env <<'EOF'
# Docker Configuration
OPENCLAW_IMAGE=ghcr.io/nikolasp98/openclaw:prd
OPENCLAW_GATEWAY_CONTAINER_NAME=openclaw_PRD_gw
OPENCLAW_CLI_CONTAINER_NAME=openclaw_PRD_cli
OPENCLAW_ENV=PRD

# Paths (using deploy user's home)
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
EOF

echo "Template .env file created at ~/openclaw-prd/.env"
EOSCRIPT

# 7. Generate secure gateway token
echo "[7/7] Generating secure gateway token..."
SECURE_TOKEN=$(openssl rand -base64 32)
su - deploy -c "sed -i 's/REPLACE_WITH_SECURE_TOKEN/$SECURE_TOKEN/g' ~/openclaw-prd/.env"
echo "Secure gateway token generated and added to .env"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "✅ Deploy user created: deploy"
echo "✅ SSH access configured"
echo "✅ Deployment directory: /home/deploy/openclaw-prd"
echo "✅ Config directory: /home/deploy/.openclaw-prd"
echo "✅ Template .env file created"
echo "✅ Secure gateway token generated"
echo ""
echo "⚠️  NEXT STEPS:"
echo "1. Edit /home/deploy/openclaw-prd/.env and add your Claude credentials:"
echo "   - CLAUDE_AI_SESSION_KEY"
echo "   - CLAUDE_WEB_SESSION_KEY"
echo "   - CLAUDE_WEB_COOKIE"
echo ""
echo "2. Copy docker-compose.yml from repository:"
echo "   scp docker-compose.yml deploy@$(hostname -I | awk '{print $1}'):/home/deploy/openclaw-prd/"
echo ""
echo "3. Test manual deployment:"
echo "   ssh deploy@$(hostname -I | awk '{print $1}') 'cd openclaw-prd && docker compose pull && docker compose up -d'"
echo ""
echo "4. Add GitHub Secrets (if not already done):"
echo "   - SSH_PRIVATE_KEY: Your private key"
echo "   - SSH_HOST: $(hostname -I | awk '{print $1}')"
echo "   - SSH_USER: deploy"
echo "   - DEPLOYMENT_PATH: /home/deploy/openclaw-prd"
echo ""
echo "5. Test automatic deployment:"
echo "   git checkout PRD && git commit --allow-empty -m 'test: trigger deployment' && git push"
echo ""
