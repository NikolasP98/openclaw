#!/bin/bash
# OpenClaw Production Backup Script (Tenant-Aware)
# This script should be run on the production server via cron
#
# Usage: backup-openclaw.sh [tenant-name]
#
# Examples:
#   backup-openclaw.sh faces      # Backup tenant "faces"
#   backup-openclaw.sh             # Backup tenant "primary" (default)
#
# Crontab example (backup faces tenant daily at 2am):
#   0 2 * * * /home/deploy/backup-openclaw.sh faces

TENANT="${1:-primary}"
DEPLOYMENT_DIR="$HOME/openclaw-prd-${TENANT}"
CONFIG_DIR="$HOME/.openclaw-prd-${TENANT}"
BACKUP_DIR="/var/backups/openclaw/${TENANT}"
DATE=$(date +%Y%m%d-%H%M%S)

# Validate tenant directories exist
if [ ! -d "$CONFIG_DIR" ]; then
    echo "Error: Config directory not found: $CONFIG_DIR"
    exit 1
fi

if [ ! -d "$DEPLOYMENT_DIR" ]; then
    echo "Error: Deployment directory not found: $DEPLOYMENT_DIR"
    exit 1
fi

mkdir -p "$BACKUP_DIR"

# Backup config directory
tar -czf "$BACKUP_DIR/config-${TENANT}-${DATE}.tar.gz" -C "$(dirname "$CONFIG_DIR")" "$(basename "$CONFIG_DIR")"

# Backup .env and docker-compose.yml
cp "$DEPLOYMENT_DIR/.env" "$BACKUP_DIR/env-${TENANT}-${DATE}"
cp "$DEPLOYMENT_DIR/docker-compose.yml" "$BACKUP_DIR/docker-compose-${TENANT}-${DATE}.yml"

# Keep only last 7 days
find "$BACKUP_DIR" -type f -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/config-${TENANT}-${DATE}.tar.gz"
