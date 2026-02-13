#!/usr/bin/env bash
# ---
# name: "Backup OpenClaw"
# description: >
#   Backs up the OpenClaw configuration directory and optionally the source
#   directory. Creates timestamped tar.gz archives with configurable retention.
#   Designed to run standalone or via cron.
# when: >
#   Run periodically to back up configuration. Can be added to crontab.
# flags:
#   -v, --verbose: "Enable debug-level logging"
# idempotent: true
# estimated_time: "0.5-2 minutes"
# ---

set -e

TENANT="${1:-primary}"
AGENT_HOME="${HOME}"
CONFIG_DIR="${AGENT_HOME}/.openclaw"
OPENCLAW_ROOT="${AGENT_HOME}/openclaw"
BACKUP_DIR="${HOME}/.openclaw-backups/${TENANT}"
DATE=$(date +%Y%m%d-%H%M%S)
RETENTION_DAYS="${RETENTION_DAYS:-7}"

# Validate directories exist
if [ ! -d "$CONFIG_DIR" ]; then
    echo "Error: Config directory not found: $CONFIG_DIR"
    exit 1
fi

mkdir -p "$BACKUP_DIR"

# Backup config directory (contains openclaw.json, credentials, workspace)
echo "Backing up config directory..."
tar -czf "$BACKUP_DIR/config-${TENANT}-${DATE}.tar.gz" \
    -C "$(dirname "$CONFIG_DIR")" \
    "$(basename "$CONFIG_DIR")" \
    2>/dev/null

# Backup source config files (not the full node_modules or dist)
if [ -d "$OPENCLAW_ROOT" ]; then
    echo "Backing up source configuration..."
    tar -czf "$BACKUP_DIR/source-config-${TENANT}-${DATE}.tar.gz" \
        -C "$OPENCLAW_ROOT" \
        --exclude='node_modules' \
        --exclude='dist' \
        --exclude='.git' \
        --exclude='.buildstamp' \
        package.json pnpm-lock.yaml 2>/dev/null || true
fi

# Backup systemd service file
if [ -f "${AGENT_HOME}/.config/systemd/user/openclaw-gateway.service" ]; then
    cp "${AGENT_HOME}/.config/systemd/user/openclaw-gateway.service" \
        "$BACKUP_DIR/openclaw-gateway.service-${DATE}"
fi

# Retain only last N days
find "$BACKUP_DIR" -type f -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true

echo "Backup completed: $BACKUP_DIR/config-${TENANT}-${DATE}.tar.gz"
echo ""
echo "To set up daily backups via cron:"
echo "  crontab -e"
echo "  # Add: 0 2 * * * $0 ${TENANT}"
