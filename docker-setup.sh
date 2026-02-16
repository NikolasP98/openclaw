#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
EXTRA_COMPOSE_FILE="$ROOT_DIR/docker-compose.extra.yml"

# Set local-build default BEFORE sourcing the library (which defaults to registry image)
MINION_IMAGE="${MINION_IMAGE:-minion:local}"

# Source shared derivation library (derives container names, config dirs, etc.)
# shellcheck source=scripts/lib/minion-env.sh
source "$ROOT_DIR/scripts/lib/minion-env.sh"

IMAGE_NAME="$MINION_IMAGE"
EXTRA_MOUNTS="${MINION_EXTRA_MOUNTS:-}"
HOME_VOLUME_NAME="${MINION_HOME_VOLUME:-}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing dependency: $1" >&2
    exit 1
  fi
}

require_cmd docker
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose not available (try: docker compose version)" >&2
  exit 1
fi

MINION_GOG_CONFIG_DIR="${MINION_GOG_CONFIG_DIR:-$HOME/.config/gogcli}"

mkdir -p "$MINION_CONFIG_DIR"
mkdir -p "$MINION_WORKSPACE_DIR"
mkdir -p "$MINION_GOG_CONFIG_DIR"

# Note: Container entrypoint will automatically fix ownership when starting
# No need to manually chown these directories

export MINION_CONFIG_DIR
export MINION_WORKSPACE_DIR
export MINION_GOG_CONFIG_DIR
export MINION_GATEWAY_PORT="${MINION_GATEWAY_PORT:-18789}"
export MINION_BRIDGE_PORT="${MINION_BRIDGE_PORT:-18790}"
export MINION_GATEWAY_BIND="${MINION_GATEWAY_BIND:-lan}"
export MINION_IMAGE="$IMAGE_NAME"
export MINION_DOCKER_APT_PACKAGES="${MINION_DOCKER_APT_PACKAGES:-}"
export MINION_EXTRA_MOUNTS="$EXTRA_MOUNTS"
export MINION_HOME_VOLUME="$HOME_VOLUME_NAME"
export MINION_ENV
export MINION_TENANT
export MINION_GATEWAY_CONTAINER_NAME
export MINION_CLI_CONTAINER_NAME

if [[ -z "${MINION_GATEWAY_TOKEN:-}" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    MINION_GATEWAY_TOKEN="$(openssl rand -hex 32)"
  else
    MINION_GATEWAY_TOKEN="$(python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
)"
  fi
fi
export MINION_GATEWAY_TOKEN

COMPOSE_FILES=("$COMPOSE_FILE")
COMPOSE_ARGS=()

write_extra_compose() {
  local home_volume="$1"
  shift
  local mount

  cat >"$EXTRA_COMPOSE_FILE" <<'YAML'
services:
  minion-gateway:
    volumes:
YAML

  if [[ -n "$home_volume" ]]; then
    printf '      - %s:/home/node\n' "$home_volume" >>"$EXTRA_COMPOSE_FILE"
    printf '      - %s:/home/node/.minion\n' "$MINION_CONFIG_DIR" >>"$EXTRA_COMPOSE_FILE"
    printf '      - %s:/home/node/.minion/workspace\n' "$MINION_WORKSPACE_DIR" >>"$EXTRA_COMPOSE_FILE"
  fi

  for mount in "$@"; do
    printf '      - %s\n' "$mount" >>"$EXTRA_COMPOSE_FILE"
  done

  cat >>"$EXTRA_COMPOSE_FILE" <<'YAML'
  minion-cli:
    volumes:
YAML

  if [[ -n "$home_volume" ]]; then
    printf '      - %s:/home/node\n' "$home_volume" >>"$EXTRA_COMPOSE_FILE"
    printf '      - %s:/home/node/.minion\n' "$MINION_CONFIG_DIR" >>"$EXTRA_COMPOSE_FILE"
    printf '      - %s:/home/node/.minion/workspace\n' "$MINION_WORKSPACE_DIR" >>"$EXTRA_COMPOSE_FILE"
    printf '      - %s:/home/node/.config/gogcli\n' "$MINION_GOG_CONFIG_DIR" >>"$EXTRA_COMPOSE_FILE"
  fi

  for mount in "$@"; do
    printf '      - %s\n' "$mount" >>"$EXTRA_COMPOSE_FILE"
  done

  if [[ -n "$home_volume" && "$home_volume" != *"/"* ]]; then
    cat >>"$EXTRA_COMPOSE_FILE" <<YAML
volumes:
  ${home_volume}:
YAML
  fi
}

VALID_MOUNTS=()
if [[ -n "$EXTRA_MOUNTS" ]]; then
  IFS=',' read -r -a mounts <<<"$EXTRA_MOUNTS"
  for mount in "${mounts[@]}"; do
    mount="${mount#"${mount%%[![:space:]]*}"}"
    mount="${mount%"${mount##*[![:space:]]}"}"
    if [[ -n "$mount" ]]; then
      VALID_MOUNTS+=("$mount")
    fi
  done
fi

if [[ -n "$HOME_VOLUME_NAME" || ${#VALID_MOUNTS[@]} -gt 0 ]]; then
  # Bash 3.2 + nounset treats "${array[@]}" on an empty array as unbound.
  if [[ ${#VALID_MOUNTS[@]} -gt 0 ]]; then
    write_extra_compose "$HOME_VOLUME_NAME" "${VALID_MOUNTS[@]}"
  else
    write_extra_compose "$HOME_VOLUME_NAME"
  fi
  COMPOSE_FILES+=("$EXTRA_COMPOSE_FILE")
fi
for compose_file in "${COMPOSE_FILES[@]}"; do
  COMPOSE_ARGS+=("-f" "$compose_file")
done
COMPOSE_HINT="docker compose"
for compose_file in "${COMPOSE_FILES[@]}"; do
  COMPOSE_HINT+=" -f ${compose_file}"
done

ENV_FILE="$ROOT_DIR/.env"
upsert_env() {
  local file="$1"
  shift
  local -a keys=("$@")
  local tmp
  tmp="$(mktemp)"
  # Use a delimited string instead of an associative array so the script
  # works with Bash 3.2 (macOS default) which lacks `declare -A`.
  local seen=" "

  if [[ -f "$file" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      local key="${line%%=*}"
      local replaced=false
      for k in "${keys[@]}"; do
        if [[ "$key" == "$k" ]]; then
          printf '%s=%s\n' "$k" "${!k-}" >>"$tmp"
          seen="$seen$k "
          replaced=true
          break
        fi
      done
      if [[ "$replaced" == false ]]; then
        printf '%s\n' "$line" >>"$tmp"
      fi
    done <"$file"
  fi

  for k in "${keys[@]}"; do
    if [[ "$seen" != *" $k "* ]]; then
      printf '%s=%s\n' "$k" "${!k-}" >>"$tmp"
    fi
  done

  mv "$tmp" "$file"
}

upsert_env "$ENV_FILE" \
  MINION_ENV \
  MINION_TENANT \
  MINION_CONFIG_DIR \
  MINION_WORKSPACE_DIR \
  MINION_GOG_CONFIG_DIR \
  MINION_GATEWAY_PORT \
  MINION_BRIDGE_PORT \
  MINION_GATEWAY_BIND \
  MINION_GATEWAY_TOKEN \
  MINION_IMAGE \
  MINION_EXTRA_MOUNTS \
  MINION_HOME_VOLUME \
  MINION_DOCKER_APT_PACKAGES \
  MINION_GATEWAY_CONTAINER_NAME \
  MINION_CLI_CONTAINER_NAME

echo "==> Building Docker image: $IMAGE_NAME"
docker build \
  --build-arg "MINION_DOCKER_APT_PACKAGES=${MINION_DOCKER_APT_PACKAGES}" \
  -t "$IMAGE_NAME" \
  -f "$ROOT_DIR/Dockerfile" \
  "$ROOT_DIR"

echo ""
echo "==> Onboarding (interactive)"
echo "When prompted:"
echo "  - Gateway bind: lan"
echo "  - Gateway auth: token"
echo "  - Gateway token: $MINION_GATEWAY_TOKEN"
echo "  - Tailscale exposure: Off"
echo "  - Install Gateway daemon: No"
echo ""
docker compose "${COMPOSE_ARGS[@]}" run --rm minion-cli onboard --no-install-daemon

echo ""
echo "==> Provider setup (optional)"
echo "WhatsApp (QR):"
echo "  ${COMPOSE_HINT} run --rm minion-cli channels login"
echo "Telegram (bot token):"
echo "  ${COMPOSE_HINT} run --rm minion-cli channels add --channel telegram --token <token>"
echo "Discord (bot token):"
echo "  ${COMPOSE_HINT} run --rm minion-cli channels add --channel discord --token <token>"
echo "Docs: https://docs.minion.ai/channels"

echo ""
echo "==> Starting gateway"
docker compose "${COMPOSE_ARGS[@]}" up -d minion-gateway

echo ""
echo "Gateway running with host port mapping."
echo "Access from tailnet devices via the host's tailnet IP."
echo "Config: $MINION_CONFIG_DIR"
echo "Workspace: $MINION_WORKSPACE_DIR"
echo "Token: $MINION_GATEWAY_TOKEN"
echo ""
echo "Commands (service: 'minion-gateway', container: '${MINION_GATEWAY_CONTAINER_NAME}'):"
echo "  ${COMPOSE_HINT} logs -f minion-gateway"
echo "  ${COMPOSE_HINT} exec minion-gateway node minion.mjs health --token \"$MINION_GATEWAY_TOKEN\""
