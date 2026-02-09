#!/bin/bash
#
# OpenClaw Production Backup Script
#
# This script creates backups of OpenClaw production data.
# Deploy this to production servers and add to crontab.
#
# Installation on server:
#   1. Copy to server: scp backup-openclaw.sh deploy@<server>:~/backup-openclaw.sh
#   2. Make executable: ssh deploy@<server> 'chmod +x ~/backup-openclaw.sh'
#   3. Test: ssh deploy@<server> '~/backup-openclaw.sh'
#   4. Add to crontab: ssh deploy@<server> 'crontab -e'
#      Add line: 0 2 * * * /home/deploy/backup-openclaw.sh
#
# Usage:
#   ./backup-openclaw.sh [tenant-name]
#
# Example:
#   ./backup-openclaw.sh acme-corp
#

set -e

# Configuration
TENANT_NAME="${1:-default}"
BACKUP_DIR="/var/backups/openclaw"
OPENCLAW_DIR="$HOME/openclaw-prd"
OPENCLAW_CONFIG_DIR="$HOME/.openclaw-prd"
DATE=$(date +%Y%m%d-%H%M%S)
RETENTION_DAYS=7

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "=== OpenClaw Backup Started ==="
echo "Tenant: $TENANT_NAME"
echo "Date: $DATE"
echo "Backup directory: $BACKUP_DIR"
echo ""

# Check if openclaw directory exists
if [[ ! -d "$OPENCLAW_DIR" ]]; then
    echo "❌ Error: OpenClaw directory not found: $OPENCLAW_DIR"
    exit 1
fi

# Backup config directory
echo "[1/4] Backing up config directory..."
if [[ -d "$OPENCLAW_CONFIG_DIR" ]]; then
    tar -czf "$BACKUP_DIR/openclaw-config-$TENANT_NAME-$DATE.tar.gz" -C "$(dirname "$OPENCLAW_CONFIG_DIR")" "$(basename "$OPENCLAW_CONFIG_DIR")"
    echo "✅ Config backup created: openclaw-config-$TENANT_NAME-$DATE.tar.gz"
else
    echo "⚠️  Warning: Config directory not found: $OPENCLAW_CONFIG_DIR"
fi

# Backup .env file
echo "[2/4] Backing up .env file..."
if [[ -f "$OPENCLAW_DIR/.env" ]]; then
    cp "$OPENCLAW_DIR/.env" "$BACKUP_DIR/env-$TENANT_NAME-$DATE"
    chmod 600 "$BACKUP_DIR/env-$TENANT_NAME-$DATE"
    echo "✅ .env backup created: env-$TENANT_NAME-$DATE"
else
    echo "⚠️  Warning: .env file not found: $OPENCLAW_DIR/.env"
fi

# Backup docker-compose.yml
echo "[3/4] Backing up docker-compose.yml..."
if [[ -f "$OPENCLAW_DIR/docker-compose.yml" ]]; then
    cp "$OPENCLAW_DIR/docker-compose.yml" "$BACKUP_DIR/docker-compose-$TENANT_NAME-$DATE.yml"
    echo "✅ docker-compose.yml backup created: docker-compose-$TENANT_NAME-$DATE.yml"
else
    echo "⚠️  Warning: docker-compose.yml not found: $OPENCLAW_DIR/docker-compose.yml"
fi

# Cleanup old backups
echo "[4/4] Cleaning up old backups (older than $RETENTION_DAYS days)..."
find "$BACKUP_DIR" -type f -name "*$TENANT_NAME*" -mtime +$RETENTION_DAYS -delete
REMAINING=$(find "$BACKUP_DIR" -type f -name "*$TENANT_NAME*" | wc -l)
echo "✅ Cleanup complete. Remaining backups: $REMAINING"

# Calculate backup size
BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)

echo ""
echo "=== Backup Complete ==="
echo "✅ Config directory backed up"
echo "✅ Environment file backed up"
echo "✅ Docker compose file backed up"
echo "✅ Old backups cleaned up"
echo ""
echo "📊 Backup Statistics:"
echo "   - Total backup size: $BACKUP_SIZE"
echo "   - Remaining backups: $REMAINING"
echo "   - Retention period: $RETENTION_DAYS days"
echo ""
echo "📁 Backup files:"
ls -lh "$BACKUP_DIR" | grep "$TENANT_NAME" | tail -n 5
echo ""

# Optional: Send notification (uncomment and configure)
# if command -v curl &> /dev/null; then
#     # Send to Discord webhook
#     # curl -X POST "<webhook-url>" -H "Content-Type: application/json" -d "{\"content\":\"✅ OpenClaw backup completed for $TENANT_NAME\"}"
#
#     # Send to Slack webhook
#     # curl -X POST "<webhook-url>" -H "Content-Type: application/json" -d "{\"text\":\"✅ OpenClaw backup completed for $TENANT_NAME\"}"
# fi
