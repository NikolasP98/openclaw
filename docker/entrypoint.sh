#!/bin/bash
set -e

OPENCLAW_HOME="/home/node/.openclaw"
GOGCLI_CONFIG="/home/node/.config/gogcli"
DEFAULT_CONFIG="/app/docker/default-config.json"

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
  "$GOGCLI_CONFIG"
)

for dir in "${dirs[@]}"; do
  if [ ! -d "$dir" ]; then
    mkdir -p "$dir"
    echo "Created directory: $dir"
  fi
done

# Copy default config only if it doesn't exist
if [ ! -f "$OPENCLAW_HOME/openclaw.json" ]; then
  cp "$DEFAULT_CONFIG" "$OPENCLAW_HOME/openclaw.json"
  chmod 644 "$OPENCLAW_HOME/openclaw.json"  # Make writable
  echo "Created default config: $OPENCLAW_HOME/openclaw.json"
else
  echo "Config exists, preserving: $OPENCLAW_HOME/openclaw.json"
fi

# Execute the main command
exec "$@"
