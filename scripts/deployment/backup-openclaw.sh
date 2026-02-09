#!/bin/bash
# OpenClaw Production Backup Script
# This script should be run on the production server via cron
#
# Add to crontab: 0 2 * * * /home/deploy/backup-openclaw.sh

BACKUP_DIR="/var/backups/openclaw"
DATE=$(date +%Y%m%d-%H%M%S)
mkdir -p $BACKUP_DIR

# Backup config directory
tar -czf $BACKUP_DIR/openclaw-prd-$DATE.tar.gz ~/.openclaw-prd

# Backup .env and docker-compose.yml
cp ~/openclaw-prd/.env $BACKUP_DIR/env-$DATE
cp ~/openclaw-prd/docker-compose.yml $BACKUP_DIR/docker-compose-$DATE.yml

# Keep only last 7 days
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/openclaw-prd-$DATE.tar.gz"
