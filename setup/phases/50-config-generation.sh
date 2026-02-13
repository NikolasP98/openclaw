#!/usr/bin/env bash
# ---
# name: "Configuration Generation"
# phase: 50
# description: >
#   Renders configuration templates (openclaw.json, systemd service, SOUL.md)
#   with environment variable values. Validates JSON syntax. Deploys config
#   files to their final locations with correct ownership and permissions.
# when: >
#   After OpenClaw is installed and alias is set up. Generates the runtime
#   configuration files the gateway needs to start.
# requires:
#   - "Phase 45 (alias setup) completed"
#   - "All configuration variables set"
# produces:
#   - "~/.openclaw/openclaw.json (mode 600)"
#   - "~/.openclaw/workspace/SOUL.md"
#   - "~/.config/systemd/user/openclaw-gateway.service"
# flags:
#   -v, --verbose: "Enable debug-level logging"
# idempotent: true
# estimated_time: "1-2 minutes"
# ---

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/logging.sh"
source "${SCRIPT_DIR}/../lib/variables.sh"
source "${SCRIPT_DIR}/../lib/templates.sh"
source "${SCRIPT_DIR}/../lib/network.sh"

generate_configuration() {
    phase_start "Configuration Generation" "50"

    local temp_dir="/tmp/openclaw-config-$$"
    mkdir -p "$temp_dir"

    local exec_user="${AGENT_USERNAME:-$(whoami)}"

    # Set defaults for channel credentials (empty if not provided)
    WHATSAPP_PHONE="${WHATSAPP_PHONE:-}"
    TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
    DISCORD_BOT_TOKEN="${DISCORD_BOT_TOKEN:-}"

    # Set defaults for deployment metadata
    DEPLOYMENT_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    DEPLOYMENT_ENVIRONMENT="${DEPLOYMENT_ENVIRONMENT:-production}"
    OPENCLAW_VERSION="${OPENCLAW_VERSION:-source}"

    # Set defaults for agent behavior
    AGENT_PERSONALITY="${AGENT_PERSONALITY:-You are a helpful AI assistant.}"
    AGENT_RESPONSIBILITIES="${AGENT_RESPONSIBILITIES:-Assist users with their requests professionally and efficiently.}"
    COMMUNICATION_STYLE="${COMMUNICATION_STYLE:-Professional, concise, and helpful}"
    DOMAIN_KNOWLEDGE="${DOMAIN_KNOWLEDGE:-General purpose knowledge and skills}"

    # Export all for template rendering
    export DEPLOYMENT_DATE DEPLOYMENT_ENVIRONMENT OPENCLAW_VERSION
    export AGENT_PERSONALITY AGENT_RESPONSIBILITIES COMMUNICATION_STYLE DOMAIN_KNOWLEDGE

    # --- Render openclaw.json ---
    log_info "Rendering openclaw.json configuration..."
    if ! render_template "${SCRIPT_DIR}/../templates/openclaw.json.template" "$temp_dir/openclaw.json"; then
        handle_error $? "Failed to render openclaw.json" "Configuration Generation"
        return 1
    fi

    log_info "Validating rendered configuration..."
    if ! validate_template "$temp_dir/openclaw.json"; then
        handle_error $? "Configuration validation failed" "Configuration Generation"
        return 1
    fi

    # Validate JSON syntax (if jq available)
    if command -v jq &> /dev/null; then
        if ! jq empty "$temp_dir/openclaw.json" 2>/dev/null; then
            log_error "Invalid JSON in rendered openclaw.json"
            handle_error 1 "Invalid JSON configuration" "Configuration Generation"
            return 1
        fi
        log_debug "JSON syntax valid"
    else
        log_debug "jq not available, skipping JSON validation"
    fi

    # --- Render systemd service ---
    log_info "Rendering systemd service file..."
    if ! render_template "${SCRIPT_DIR}/../templates/systemd-user.service.template" "$temp_dir/openclaw-gateway.service"; then
        handle_error $? "Failed to render service file" "Configuration Generation"
        return 1
    fi

    # --- Render SOUL.md ---
    log_info "Rendering SOUL.md..."
    if ! render_template "${SCRIPT_DIR}/../templates/SOUL.md.template" "$temp_dir/SOUL.md"; then
        handle_error $? "Failed to render SOUL.md" "Configuration Generation"
        return 1
    fi

    # --- Deploy files ---
    log_info "Deploying configuration files..."

    local config_dir="${OPENCLAW_CONFIG_DIR:-${AGENT_HOME_DIR:-$HOME}/.openclaw}"
    local workspace_dir="${WORKSPACE_DIR:-${config_dir}/workspace}"
    local systemd_dir="${AGENT_HOME_DIR:-$HOME}/.config/systemd/user"

    if [ "${EXEC_MODE:-local}" = "remote" ]; then
        # Remote: SCP files then move into place
        local remote_tmp="/tmp/openclaw-deploy-$$"
        run_cmd --as root "mkdir -p '$remote_tmp'"

        copy_file "$temp_dir/openclaw.json" "$remote_tmp/openclaw.json" root
        copy_file "$temp_dir/openclaw-gateway.service" "$remote_tmp/openclaw-gateway.service" root
        copy_file "$temp_dir/SOUL.md" "$remote_tmp/SOUL.md" root

        run_cmd --as root "cp '$remote_tmp/openclaw.json' '${config_dir}/openclaw.json'"
        run_cmd --as root "cp '$remote_tmp/SOUL.md' '${workspace_dir}/SOUL.md'"
        run_cmd --as root "cp '$remote_tmp/openclaw-gateway.service' '${systemd_dir}/openclaw-gateway.service'"

        run_cmd --as root "chown ${exec_user}:${exec_user} '${config_dir}/openclaw.json'"
        run_cmd --as root "chown ${exec_user}:${exec_user} '${workspace_dir}/SOUL.md'"
        run_cmd --as root "chown ${exec_user}:${exec_user} '${systemd_dir}/openclaw-gateway.service'"

        run_cmd --as root "chmod 600 '${config_dir}/openclaw.json'"
        run_cmd --as root "chmod 644 '${workspace_dir}/SOUL.md'"
        run_cmd --as root "chmod 644 '${systemd_dir}/openclaw-gateway.service'"

        run_cmd --as root "rm -rf '$remote_tmp'"
    else
        # Local: copy directly
        cp "$temp_dir/openclaw.json" "${config_dir}/openclaw.json"
        cp "$temp_dir/SOUL.md" "${workspace_dir}/SOUL.md"
        cp "$temp_dir/openclaw-gateway.service" "${systemd_dir}/openclaw-gateway.service"

        chmod 600 "${config_dir}/openclaw.json"
        chmod 644 "${workspace_dir}/SOUL.md"
        chmod 644 "${systemd_dir}/openclaw-gateway.service"
    fi

    # Cleanup local temp
    rm -rf "$temp_dir"

    log_success "Configuration files deployed successfully"

    phase_end "Configuration Generation" "success"
    save_checkpoint "50-config-generation"
    return 0
}

# Run configuration generation if executed directly
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    generate_configuration
fi
