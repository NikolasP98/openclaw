#!/usr/bin/env bash
# One-time host setup for rootless Minion in Podman: creates the minion
# user, builds the image, loads it into that user's Podman store, and installs
# the launch script. Run from repo root with sudo capability.
#
# Usage: ./setup-podman.sh [--quadlet|--container]
#   --quadlet   Install systemd Quadlet so the container runs as a user service
#   --container Only install user + image + launch script; you start the container manually (default)
#   Or set MINION_PODMAN_QUADLET=1 (or 0) to choose without a flag.
#
# After this, start the gateway manually:
#   ./scripts/run-minion-podman.sh launch
#   ./scripts/run-minion-podman.sh launch setup   # onboarding wizard
# Or as the minion user: sudo -u minion /home/minion/run-minion-podman.sh
# If you used --quadlet, you can also: sudo systemctl --machine minion@ --user start minion.service
set -euo pipefail

MINION_USER="${MINION_PODMAN_USER:-minion}"
REPO_PATH="${MINION_REPO_PATH:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
RUN_SCRIPT_SRC="$REPO_PATH/scripts/run-minion-podman.sh"
QUADLET_TEMPLATE="$REPO_PATH/scripts/podman/minion.container.in"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing dependency: $1" >&2
    exit 1
  fi
}

is_root() { [[ "$(id -u)" -eq 0 ]]; }

run_root() {
  if is_root; then
    "$@"
  else
    sudo "$@"
  fi
}

run_as_user() {
  local user="$1"
  shift
  if command -v sudo >/dev/null 2>&1; then
    sudo -u "$user" "$@"
  elif is_root && command -v runuser >/dev/null 2>&1; then
    runuser -u "$user" -- "$@"
  else
    echo "Need sudo (or root+runuser) to run commands as $user." >&2
    exit 1
  fi
}

run_as_minion() {
  # Avoid root writes into $MINION_HOME (symlink/hardlink/TOCTOU footguns).
  # Anything under the target user's home should be created/modified as that user.
  run_as_user "$MINION_USER" env HOME="$MINION_HOME" "$@"
}

# Quadlet: opt-in via --quadlet or MINION_PODMAN_QUADLET=1
INSTALL_QUADLET=false
for arg in "$@"; do
  case "$arg" in
    --quadlet)   INSTALL_QUADLET=true ;;
    --container) INSTALL_QUADLET=false ;;
  esac
done
if [[ -n "${MINION_PODMAN_QUADLET:-}" ]]; then
  case "${MINION_PODMAN_QUADLET,,}" in
    1|yes|true)  INSTALL_QUADLET=true ;;
    0|no|false) INSTALL_QUADLET=false ;;
  esac
fi

require_cmd podman
if ! is_root; then
  require_cmd sudo
fi
if [[ ! -f "$REPO_PATH/Dockerfile" ]]; then
  echo "Dockerfile not found at $REPO_PATH. Set MINION_REPO_PATH to the repo root." >&2
  exit 1
fi
if [[ ! -f "$RUN_SCRIPT_SRC" ]]; then
  echo "Launch script not found at $RUN_SCRIPT_SRC." >&2
  exit 1
fi

generate_token_hex_32() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
    return 0
  fi
  if command -v od >/dev/null 2>&1; then
    # 32 random bytes -> 64 lowercase hex chars
    od -An -N32 -tx1 /dev/urandom | tr -d " \n"
    return 0
  fi
  echo "Missing dependency: need openssl or python3 (or od) to generate MINION_GATEWAY_TOKEN." >&2
  exit 1
}

user_exists() {
  local user="$1"
  if command -v getent >/dev/null 2>&1; then
    getent passwd "$user" >/dev/null 2>&1 && return 0
  fi
  id -u "$user" >/dev/null 2>&1
}

resolve_user_home() {
  local user="$1"
  local home=""
  if command -v getent >/dev/null 2>&1; then
    home="$(getent passwd "$user" 2>/dev/null | cut -d: -f6 || true)"
  fi
  if [[ -z "$home" && -f /etc/passwd ]]; then
    home="$(awk -F: -v u="$user" '$1==u {print $6}' /etc/passwd 2>/dev/null || true)"
  fi
  if [[ -z "$home" ]]; then
    home="/home/$user"
  fi
  printf '%s' "$home"
}

resolve_nologin_shell() {
  for cand in /usr/sbin/nologin /sbin/nologin /usr/bin/nologin /bin/false; do
    if [[ -x "$cand" ]]; then
      printf '%s' "$cand"
      return 0
    fi
  done
  printf '%s' "/usr/sbin/nologin"
}

# Create minion user (non-login, with home) if missing
if ! user_exists "$MINION_USER"; then
  NOLOGIN_SHELL="$(resolve_nologin_shell)"
  echo "Creating user $MINION_USER ($NOLOGIN_SHELL, with home)..."
  if command -v useradd >/dev/null 2>&1; then
    run_root useradd -m -s "$NOLOGIN_SHELL" "$MINION_USER"
  elif command -v adduser >/dev/null 2>&1; then
    # Debian/Ubuntu: adduser supports --disabled-password/--gecos. Busybox adduser differs.
    run_root adduser --disabled-password --gecos "" --shell "$NOLOGIN_SHELL" "$MINION_USER"
  else
    echo "Neither useradd nor adduser found, cannot create user $MINION_USER." >&2
    exit 1
  fi
else
  echo "User $MINION_USER already exists."
fi

MINION_HOME="$(resolve_user_home "$MINION_USER")"
MINION_UID="$(id -u "$MINION_USER" 2>/dev/null || true)"
MINION_CONFIG="$MINION_HOME/.minion"
LAUNCH_SCRIPT_DST="$MINION_HOME/run-minion-podman.sh"

# Prefer systemd user services (Quadlet) for production. Enable lingering early so rootless Podman can run
# without an interactive login.
if command -v loginctl &>/dev/null; then
  run_root loginctl enable-linger "$MINION_USER" 2>/dev/null || true
fi
if [[ -n "${MINION_UID:-}" && -d /run/user ]] && command -v systemctl &>/dev/null; then
  run_root systemctl start "user@${MINION_UID}.service" 2>/dev/null || true
fi

# Rootless Podman needs subuid/subgid for the run user
if ! grep -q "^${MINION_USER}:" /etc/subuid 2>/dev/null; then
  echo "Warning: $MINION_USER has no subuid range. Rootless Podman may fail." >&2
  echo "  Add a line to /etc/subuid and /etc/subgid, e.g.: $MINION_USER:100000:65536" >&2
fi

echo "Creating $MINION_CONFIG and workspace..."
run_as_minion mkdir -p "$MINION_CONFIG/workspace"
run_as_minion chmod 700 "$MINION_CONFIG" "$MINION_CONFIG/workspace" 2>/dev/null || true

ENV_FILE="$MINION_CONFIG/.env"
if run_as_minion test -f "$ENV_FILE"; then
  if ! run_as_minion grep -q '^MINION_GATEWAY_TOKEN=' "$ENV_FILE" 2>/dev/null; then
    TOKEN="$(generate_token_hex_32)"
    printf 'MINION_GATEWAY_TOKEN=%s\n' "$TOKEN" | run_as_minion tee -a "$ENV_FILE" >/dev/null
    echo "Added MINION_GATEWAY_TOKEN to $ENV_FILE."
  fi
  run_as_minion chmod 600 "$ENV_FILE" 2>/dev/null || true
else
  TOKEN="$(generate_token_hex_32)"
  printf 'MINION_GATEWAY_TOKEN=%s\n' "$TOKEN" | run_as_minion tee "$ENV_FILE" >/dev/null
  run_as_minion chmod 600 "$ENV_FILE" 2>/dev/null || true
  echo "Created $ENV_FILE with new token."
fi

# The gateway refuses to start unless gateway.mode=local is set in config.
# Make first-run non-interactive; users can run the wizard later to configure channels/providers.
MINION_JSON="$MINION_CONFIG/minion.json"
if ! run_as_minion test -f "$MINION_JSON"; then
  printf '%s\n' '{ gateway: { mode: "local" } }' | run_as_minion tee "$MINION_JSON" >/dev/null
  run_as_minion chmod 600 "$MINION_JSON" 2>/dev/null || true
  echo "Created $MINION_JSON (minimal gateway.mode=local)."
fi

echo "Building image from $REPO_PATH..."
podman build -t minion:local -f "$REPO_PATH/Dockerfile" "$REPO_PATH"

echo "Loading image into $MINION_USER's Podman store..."
TMP_IMAGE="$(mktemp -p /tmp minion-image.XXXXXX.tar)"
trap 'rm -f "$TMP_IMAGE"' EXIT
podman save minion:local -o "$TMP_IMAGE"
chmod 644 "$TMP_IMAGE"
(cd /tmp && run_as_user "$MINION_USER" env HOME="$MINION_HOME" podman load -i "$TMP_IMAGE")
rm -f "$TMP_IMAGE"
trap - EXIT

echo "Copying launch script to $LAUNCH_SCRIPT_DST..."
run_root cat "$RUN_SCRIPT_SRC" | run_as_minion tee "$LAUNCH_SCRIPT_DST" >/dev/null
run_as_minion chmod 755 "$LAUNCH_SCRIPT_DST"

# Optionally install systemd quadlet for minion user (rootless Podman + systemd)
QUADLET_DIR="$MINION_HOME/.config/containers/systemd"
if [[ "$INSTALL_QUADLET" == true && -f "$QUADLET_TEMPLATE" ]]; then
  echo "Installing systemd quadlet for $MINION_USER..."
  run_as_minion mkdir -p "$QUADLET_DIR"
  MINION_HOME_SED="$(printf '%s' "$MINION_HOME" | sed -e 's/[\\/&|]/\\\\&/g')"
  sed "s|{{MINION_HOME}}|$MINION_HOME_SED|g" "$QUADLET_TEMPLATE" | run_as_minion tee "$QUADLET_DIR/minion.container" >/dev/null
  run_as_minion chmod 700 "$MINION_HOME/.config" "$MINION_HOME/.config/containers" "$QUADLET_DIR" 2>/dev/null || true
  run_as_minion chmod 600 "$QUADLET_DIR/minion.container" 2>/dev/null || true
  if command -v systemctl &>/dev/null; then
    run_root systemctl --machine "${MINION_USER}@" --user daemon-reload 2>/dev/null || true
    run_root systemctl --machine "${MINION_USER}@" --user enable minion.service 2>/dev/null || true
    run_root systemctl --machine "${MINION_USER}@" --user start minion.service 2>/dev/null || true
  fi
fi

echo ""
echo "Setup complete. Start the gateway:"
echo "  $RUN_SCRIPT_SRC launch"
echo "  $RUN_SCRIPT_SRC launch setup   # onboarding wizard"
echo "Or as $MINION_USER (e.g. from cron):"
echo "  sudo -u $MINION_USER $LAUNCH_SCRIPT_DST"
echo "  sudo -u $MINION_USER $LAUNCH_SCRIPT_DST setup"
if [[ "$INSTALL_QUADLET" == true ]]; then
  echo "Or use systemd (quadlet):"
  echo "  sudo systemctl --machine ${MINION_USER}@ --user start minion.service"
  echo "  sudo systemctl --machine ${MINION_USER}@ --user status minion.service"
else
  echo "To install systemd quadlet later: $0 --quadlet"
fi
