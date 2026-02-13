#!/usr/bin/env bash
# ---
# name: "OpenClaw Setup Orchestrator"
# description: >
#   Single entry-point for deploying OpenClaw from source on a VPS.
#   Supports two modes: remote (orchestrate VPS via SSH from local machine)
#   and local (run directly on the VPS). Installs via git clone + pnpm install
#   + pnpm build, sets up systemd user service, and creates the openclaw CLI alias.
# when: >
#   Run this to deploy a new OpenClaw instance or update an existing one.
#   Use --mode=remote from your local machine, or --mode=local on the VPS itself.
#   If --vps-hostname is provided, mode auto-detects to remote.
# flags:
#   --mode=MODE: "local or remote (auto-detect if omitted)"
#   --install-dir=PATH: "Where to clone openclaw (default: ~/openclaw)"
#   --repo=REPO: "GitHub repo (default: NikolasP98/openclaw)"
#   --branch=BRANCH: "Git branch (default: main)"
#   --update: "Pull latest source and rebuild"
#   --profile=PROFILE: "Load from profile file"
#   --vps-hostname=HOST: "VPS hostname (implies --mode=remote)"
#   --api-key=KEY: "Anthropic API key"
#   --tailscale-key=KEY: "Tailscale auth key"
#   --github-pat=TOKEN: "GitHub PAT"
#   --agent-name=NAME: "Agent name"
#   --tenant=NAME: "Tenant identifier"
#   --dry-run: "Show what would happen"
#   --skip-phase=PHASE: "Skip specific phase"
#   --start-from=PHASE: "Resume from phase"
#   -v, --verbose: "Debug-level logging"
#   --help: "Usage information"
# idempotent: true
# ---

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source libraries
source "${SCRIPT_DIR}/lib/logging.sh"
source "${SCRIPT_DIR}/lib/variables.sh"
source "${SCRIPT_DIR}/lib/network.sh"
source "${SCRIPT_DIR}/lib/templates.sh"

# Default values
DRY_RUN=false
SKIP_PHASES=()
START_FROM_PHASE=""
PROFILE=""
UPDATE_MODE=false
DECOMMISSION_MODE=false

# Display usage information
usage() {
    cat << 'EOF'
OpenClaw Setup - VPS User-Level Deployment via pnpm

Usage: setup.sh [OPTIONS]

Modes:
    --mode=MODE             Execution mode: local, remote (auto-detect if omitted)
                            If --vps-hostname is set, defaults to remote; otherwise local.

Source Install:
    --install-dir=PATH      Where to clone openclaw (default: ~/openclaw)
    --repo=REPO             GitHub repo (default: NikolasP98/openclaw)
    --branch=BRANCH         Git branch to checkout (default: main)
    --update                Pull latest source and rebuild (for existing installs)
    --decommission          Stop services, free disk space, preserve config (non-destructive)

Configuration:
    --profile=PROFILE       Load configuration from profile file
    --vps-hostname=HOST     VPS hostname or IP address (implies --mode=remote)
    --api-key=KEY           Anthropic API key (required)
    --tailscale-key=KEY     Tailscale auth key
    --github-pat=TOKEN      GitHub Personal Access Token
    --gateway-port=PORT     Gateway listen port (default: 18789)
    --gateway-bind=MODE     Bind mode: loopback, lan, tailnet (default: loopback)
    --gateway-token=TOKEN   Gateway auth token (auto-generated if omitted)

Agent:
    --agent-name=NAME       Agent name
    --agent-personality=DESC  Agent personality description
    --sandbox-mode=MODE     Sandbox mode: off, non-main, all (default: non-main)
    --dm-policy=POLICY      DM policy: open, pairing (default: pairing)
    --tenant=NAME           Tenant identifier (for multi-tenant)

Channels:
    --enable-whatsapp       Enable WhatsApp channel
    --enable-telegram       Enable Telegram channel
    --enable-discord        Enable Discord channel
    --whatsapp-phone=PHONE  WhatsApp phone number
    --telegram-token=TOKEN  Telegram bot token
    --discord-token=TOKEN   Discord bot token

System:
    --node-method=METHOD    Node.js install method: apt, nvm, skip (default: apt)

Execution:
    --dry-run               Show what would be done without executing
    --skip-phase=PHASE      Skip specific phase (can be repeated)
    --start-from=PHASE      Start from specific phase (resume deployment)
    --force-reinstall       Force reinstall even if present
    -v, --verbose           Enable debug-level logging
    --help                  Show this help message

Examples:
    # Local mode (running on the VPS directly)
    ./setup/setup.sh --api-key=sk-ant-xxx --agent-name=mybot

    # Remote mode (from local machine to VPS via SSH)
    ./setup/setup.sh --vps-hostname=server.example.com \
       --profile=customer-support --api-key=sk-ant-xxx \
       --github-pat=ghp_xxx

    # Update existing install
    ./setup/setup.sh --update --verbose

    # Decommission (stop services, free disk, preserve config)
    ./setup/setup.sh --decommission --vps-hostname=server.example.com --agent-name=mybot

    # Dry run
    ./setup/setup.sh --dry-run --api-key=sk-ant-test --verbose

EOF
    exit 0
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --help)
                usage
                ;;
            --mode=*)
                EXEC_MODE="${1#*=}"
                ;;
            --install-dir=*)
                OPENCLAW_ROOT="${1#*=}"
                ;;
            --repo=*)
                GITHUB_REPO="${1#*=}"
                ;;
            --branch=*)
                GITHUB_BRANCH="${1#*=}"
                ;;
            --update)
                UPDATE_MODE=true
                ;;
            --decommission)
                DECOMMISSION_MODE=true
                ;;
            --profile=*)
                PROFILE="${1#*=}"
                ;;
            --vps-hostname=*)
                VPS_HOSTNAME="${1#*=}"
                ;;
            --api-key=*)
                ANTHROPIC_API_KEY="${1#*=}"
                ;;
            --tailscale-key=*)
                TAILSCALE_AUTH_KEY="${1#*=}"
                ;;
            --github-pat=*)
                GITHUB_PAT="${1#*=}"
                ;;
            --agent-name=*)
                AGENT_NAME="${1#*=}"
                ;;
            --agent-personality=*)
                AGENT_PERSONALITY="${1#*=}"
                ;;
            --sandbox-mode=*)
                SANDBOX_MODE="${1#*=}"
                ;;
            --dm-policy=*)
                DM_POLICY="${1#*=}"
                ;;
            --tenant=*)
                OPENCLAW_TENANT="${1#*=}"
                ;;
            --enable-whatsapp)
                ENABLE_WHATSAPP=true
                ;;
            --enable-telegram)
                ENABLE_TELEGRAM=true
                ;;
            --enable-discord)
                ENABLE_DISCORD=true
                ;;
            --whatsapp-phone=*)
                WHATSAPP_PHONE="${1#*=}"
                ;;
            --telegram-token=*)
                TELEGRAM_BOT_TOKEN="${1#*=}"
                ;;
            --discord-token=*)
                DISCORD_BOT_TOKEN="${1#*=}"
                ;;
            --gateway-port=*)
                GATEWAY_PORT="${1#*=}"
                ;;
            --gateway-bind=*)
                GATEWAY_BIND="${1#*=}"
                ;;
            --gateway-token=*)
                GATEWAY_AUTH_TOKEN="${1#*=}"
                ;;
            --node-method=*)
                NODE_INSTALL_METHOD="${1#*=}"
                ;;
            --dry-run)
                DRY_RUN=true
                ;;
            --skip-phase=*)
                SKIP_PHASES+=("${1#*=}")
                ;;
            --start-from=*)
                START_FROM_PHASE="${1#*=}"
                ;;
            --force-reinstall)
                FORCE_REINSTALL=true
                ;;
            -v|--verbose)
                VERBOSE=true
                export VERBOSE
                CURRENT_LOG_LEVEL=$LOG_LEVEL_DEBUG
                ;;
            *)
                echo "Unknown option: $1"
                echo "Run with --help for usage information"
                exit 1
                ;;
        esac
        shift
    done

    # Auto-detect mode: if VPS_HOSTNAME is set, default to remote
    if [ -z "${EXEC_MODE:-}" ]; then
        if [ -n "${VPS_HOSTNAME:-}" ]; then
            EXEC_MODE="remote"
        else
            EXEC_MODE="local"
        fi
    fi

    export EXEC_MODE
}

# Load profile if specified
load_profile_if_specified() {
    if [ -n "$PROFILE" ]; then
        local profile_file="${SCRIPT_DIR}/profiles/${PROFILE}.profile.yaml"
        if [ ! -f "$profile_file" ]; then
            # Try without .profile.yaml extension
            profile_file="${SCRIPT_DIR}/profiles/${PROFILE}"
        fi

        if [ -f "$profile_file" ]; then
            load_profile "$profile_file"
        else
            log_error "Profile not found: $PROFILE"
            exit 1
        fi
    fi
}

# Check if phase should be skipped
should_skip_phase() {
    local phase="$1"

    # Check if phase is in skip list
    for skip in "${SKIP_PHASES[@]}"; do
        if [ "$phase" = "$skip" ]; then
            return 0
        fi
    done

    # Check if we should start from a later phase
    if [ -n "$START_FROM_PHASE" ]; then
        local phase_num="${phase%%-*}"
        local start_num="${START_FROM_PHASE%%-*}"

        if [ "$phase_num" -lt "$start_num" ]; then
            return 0
        fi
    fi

    return 1
}

# Execute deployment phase
execute_phase() {
    local phase_script="$1"
    local phase_name="${phase_script##*/}"
    phase_name="${phase_name%.sh}"

    if should_skip_phase "$phase_name"; then
        log_info "Skipping phase: $phase_name"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would execute phase: $phase_name"
        return 0
    fi

    log_info "Executing phase: $phase_name"

    if ! bash "$phase_script"; then
        log_error "Phase failed: $phase_name"
        log_info "Starting rollback..."
        bash "${SCRIPT_DIR}/phases/99-rollback.sh"
        exit 1
    fi

    return 0
}

# Export all configuration variables for child processes
export_variables() {
    export VPS_HOSTNAME TAILSCALE_AUTH_KEY ANTHROPIC_API_KEY GITHUB_PAT
    export AGENT_NAME AGENT_PERSONALITY SANDBOX_MODE DM_POLICY
    export ENABLE_WHATSAPP ENABLE_TELEGRAM ENABLE_DISCORD ENABLE_WEB
    export WHATSAPP_PHONE TELEGRAM_BOT_TOKEN DISCORD_BOT_TOKEN
    export NODE_INSTALL_METHOD FORCE_REINSTALL UPDATE_MODE DECOMMISSION_MODE
    export GATEWAY_PORT GATEWAY_BIND AGENT_MODEL AGENT_USERNAME GATEWAY_AUTH_TOKEN
    export AGENT_HOME_DIR OPENCLAW_CONFIG_DIR WORKSPACE_DIR
    export OPENCLAW_ROOT OPENCLAW_WRAPPER NODE_BIN_PATH
    export GITHUB_REPO GITHUB_BRANCH EXEC_MODE
    export MEMORY_LIMIT CPU_QUOTA
    export OPENCLAW_TENANT
    export DRY_RUN VERBOSE CURRENT_LOG_LEVEL
    export LOG_DIR LOG_FILE
} 2>/dev/null  # suppress errors for unset variables

# Main deployment sequence
main() {
    echo -e "${CYAN}"
    cat << "BANNER"
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ██████╗ ██████╗ ███████╗███╗   ██╗ ██████╗██╗      █████╗  ║
║  ██╔═══██╗██╔══██╗██╔════╝████╗  ██║██╔════╝██║     ██╔══██╗ ║
║  ██║   ██║██████╔╝█████╗  ██╔██╗ ██║██║     ██║     ███████║ ║
║  ██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║██║     ██║     ██╔══██║ ║
║  ╚██████╔╝██║     ███████╗██║ ╚████║╚██████╗███████╗██║  ██║ ║
║   ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝ ╚═════╝╚══════╝╚═╝  ╚═╝║
║                                                               ║
║              VPS Setup Framework (pnpm source)                ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
BANNER
    echo -e "${NC}"

    log_info "Starting OpenClaw setup"
    log_info "Log file: $LOG_FILE"

    # Parse arguments
    parse_args "$@"

    # Load profile (before deriving so profile values take effect)
    load_profile_if_specified

    # Derive system variables from inputs
    derive_system_variables

    # Export everything for child processes
    export_variables

    log_info "Execution mode: $EXEC_MODE"

    # Decommission mode: run only phase 95 and exit
    if [ "$DECOMMISSION_MODE" = true ]; then
        log_warn "DECOMMISSION MODE - Stopping services and freeing disk space"
        execute_phase "${SCRIPT_DIR}/phases/95-decommission.sh"
        log_success "Decommission completed"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        log_warn "DRY RUN MODE - No changes will be made"
        display_config
        echo ""
        log_info "Phases that would execute:"
    fi

    # Execute phases in sequence
    local phases=(
        "00-preflight.sh"
        "20-user-creation.sh"
        "30-environment-setup.sh"
        "40-openclaw-install.sh"
        "45-alias-setup.sh"
        "50-config-generation.sh"
        "60-service-setup.sh"
        "70-verification.sh"
    )

    for phase_script in "${phases[@]}"; do
        execute_phase "${SCRIPT_DIR}/phases/${phase_script}"
    done

    if [ "$DRY_RUN" = true ]; then
        echo ""
        log_info "Dry run complete. No changes were made."
        exit 0
    fi

    log_success "OpenClaw setup completed successfully!"
    return 0
}

# Run main function with all arguments
main "$@"
