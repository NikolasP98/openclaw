#!/bin/bash
#
# OpenClaw Deployment SSH Key Generator
#
# This script generates SSH keys for GitHub Actions deployment.
# Run this on your local machine.
#
# Usage:
#   ./generate-deploy-keys.sh [output-directory]
#
# Example:
#   ./generate-deploy-keys.sh ~/.ssh/openclaw
#

set -e

# Parse arguments
OUTPUT_DIR="${1:-$HOME/.ssh/openclaw}"
KEY_NAME="openclaw_deploy_key"
KEY_PATH="$OUTPUT_DIR/$KEY_NAME"

echo "=== OpenClaw Deployment SSH Key Generator ==="
echo "Output directory: $OUTPUT_DIR"
echo "Key name: $KEY_NAME"
echo ""

# Create output directory if it doesn't exist
if [[ ! -d "$OUTPUT_DIR" ]]; then
    echo "Creating output directory: $OUTPUT_DIR"
    mkdir -p "$OUTPUT_DIR"
    chmod 700 "$OUTPUT_DIR"
fi

# Check if key already exists
if [[ -f "$KEY_PATH" ]]; then
    echo "⚠️  Warning: Key already exists at $KEY_PATH"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted. Existing key preserved."
        exit 0
    fi
    echo "Overwriting existing key..."
fi

# Generate SSH key
echo "Generating SSH key..."
ssh-keygen -t ed25519 -C "github-actions-openclaw-deploy" -f "$KEY_PATH" -N ""

echo ""
echo "=== SSH Key Generated ==="
echo ""
echo "✅ Private key: $KEY_PATH"
echo "✅ Public key: ${KEY_PATH}.pub"
echo ""
echo "⚠️  NEXT STEPS:"
echo ""
echo "1. Add the PRIVATE key to GitHub Secrets:"
echo "   - Go to: Repository → Settings → Secrets and variables → Actions"
echo "   - Click 'New repository secret'"
echo "   - Name: SSH_PRIVATE_KEY"
echo "   - Value: Copy entire contents of private key (including BEGIN/END lines)"
echo ""
echo "   To copy private key to clipboard (Linux):"
echo "   cat $KEY_PATH | xclip -selection clipboard"
echo ""
echo "   Or manually copy:"
echo "   cat $KEY_PATH"
echo ""
echo "2. Add the PUBLIC key to production server(s):"
echo "   - Option A (using setup-server.sh script):"
echo "     sudo ./setup-server.sh <tenant-name> ${KEY_PATH}.pub"
echo ""
echo "   - Option B (manual):"
echo "     cat ${KEY_PATH}.pub | ssh root@<server-ip> \"su - deploy -c 'cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'\""
echo ""
echo "3. Test SSH connection:"
echo "   ssh -i $KEY_PATH deploy@<server-ip> 'docker ps'"
echo ""
echo "4. Add other GitHub Secrets:"
echo "   - SSH_HOST: <server-ip>"
echo "   - SSH_USER: deploy"
echo "   - SSH_PORT: 22"
echo "   - DEPLOYMENT_PATH: /home/deploy/openclaw-prd"
echo ""
echo "🔒 SECURITY WARNING:"
echo "   - Keep the private key ($KEY_PATH) SECURE"
echo "   - Never commit private keys to git"
echo "   - Only share with trusted team members"
echo "   - Rotate keys periodically (quarterly recommended)"
echo ""
