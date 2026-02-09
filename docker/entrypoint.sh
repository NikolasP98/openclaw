#!/bin/bash
set -e

OPENCLAW_HOME="/home/node/.openclaw"
GOGCLI_CONFIG="/home/node/.config/gogcli"
DEFAULT_CONFIG="/app/docker/default-config.json"

log() {
  echo "[entrypoint] $*"
}

# Create required directories if they don't exist
dirs=(
  "$OPENCLAW_HOME"
  "$OPENCLAW_HOME/workspace"
  "$OPENCLAW_HOME/agents"
  "$OPENCLAW_HOME/canvas"
  "$OPENCLAW_HOME/credentials"
  "$OPENCLAW_HOME/devices"
  "$OPENCLAW_HOME/identity"
  "$OPENCLAW_HOME/media"
  "$OPENCLAW_HOME/memory"
  "$OPENCLAW_HOME/cron"
  "$OPENCLAW_HOME/sessions"
  "$GOGCLI_CONFIG"
)

for dir in "${dirs[@]}"; do
  if [ ! -d "$dir" ]; then
    mkdir -p "$dir"
    log "Created directory: $dir"
  fi

  # Fix ownership if not already owned by node user (uid 1000)
  current_owner=$(stat -c '%u' "$dir" 2>/dev/null || stat -f '%u' "$dir" 2>/dev/null || echo "unknown")
  if [ "$current_owner" != "1000" ] && [ "$current_owner" != "unknown" ]; then
    log "Fixing ownership of $dir (was uid $current_owner, setting to 1000:1000)"
    chown -R 1000:1000 "$dir"
  fi
done

# Copy default config only if it doesn't exist
if [ -f "$DEFAULT_CONFIG" ]; then
  if [ ! -f "$OPENCLAW_HOME/openclaw.json" ]; then
    cp "$DEFAULT_CONFIG" "$OPENCLAW_HOME/openclaw.json"
    chmod 644 "$OPENCLAW_HOME/openclaw.json"
    log "Created default config: $OPENCLAW_HOME/openclaw.json"
  else
    log "Config exists, preserving: $OPENCLAW_HOME/openclaw.json"
  fi
else
  log "Warning: Default config not found at $DEFAULT_CONFIG"
fi

# Drop privileges to node user and execute the main command
log "Dropping privileges to node user (uid 1000)"

# Auto-prepend node dist/index.js for OpenClaw commands
# Allow system commands (node, bash, sh, etc.) to pass through unchanged
case "$1" in
  node|bash|sh|/bin/*|/usr/bin/*|"")
    # System command or empty - execute as-is
    exec gosu node "$@"
    ;;
  *)
    # OpenClaw CLI command - prepend node dist/index.js
    exec gosu node node dist/index.js "$@"
    ;;
esac
