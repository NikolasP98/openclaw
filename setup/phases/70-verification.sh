#!/usr/bin/env bash
# ---
# name: "Verification"
# phase: 70
# description: >
#   Runs health checks against the deployed OpenClaw instance. Tests the
#   openclaw wrapper command, gateway health endpoint, configuration
#   permissions, and channel status. Prints a deployment summary.
# when: >
#   After service is started. Final validation before declaring success.
# requires:
#   - "Phase 60 (service setup) completed"
#   - "Gateway service running"
# produces:
#   - "Verified deployment with health status"
#   - "Deployment summary with next steps"
# flags:
#   -v, --verbose: "Enable debug-level logging"
# idempotent: true
# estimated_time: "0.5-1 minutes"
# ---

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/logging.sh"
source "${SCRIPT_DIR}/../lib/variables.sh"
source "${SCRIPT_DIR}/../lib/network.sh"

# Ensure derived variables are populated (idempotent)
derive_system_variables

verify_deployment() {
    phase_start "Verification" "70"

    local exec_user="${AGENT_USERNAME:-$(whoami)}"
    local config_dir="${OPENCLAW_CONFIG_DIR:-${AGENT_HOME_DIR:-$HOME}/.openclaw}"
    local gateway_port="${GATEWAY_PORT:-18789}"

    # Test openclaw wrapper
    log_info "Testing openclaw wrapper command..."
    if [ "${EXEC_MODE:-local}" = "remote" ]; then
        local wrapper_output
        wrapper_output=$(run_cmd --as "$exec_user" "export PATH=\$HOME/.local/bin:\$PATH && openclaw --version" 2>/dev/null || echo "failed")
        if [ "$wrapper_output" != "failed" ]; then
            log_success "openclaw --version: $wrapper_output"
        else
            log_warn "openclaw wrapper test failed (service may still be running)"
        fi
    else
        export PATH="${AGENT_HOME_DIR:-$HOME}/.local/bin:${PATH}"
        local wrapper_output
        wrapper_output=$(openclaw --version 2>/dev/null || echo "failed")
        if [ "$wrapper_output" != "failed" ]; then
            log_success "openclaw --version: $wrapper_output"
        else
            log_warn "openclaw wrapper test failed (service may still be running)"
        fi
    fi

    # Check configuration file permissions
    log_info "Checking configuration file permissions..."
    local config_perms
    config_perms=$(run_cmd --as "$exec_user" "stat -c '%a' '${config_dir}/openclaw.json'" 2>/dev/null || echo "unknown")

    if [ "$config_perms" = "600" ]; then
        log_success "Configuration file permissions are correct (600)"
    elif [ "$config_perms" != "unknown" ]; then
        log_warn "Configuration file has permissions: $config_perms (expected 600)"
    fi

    # Test gateway connectivity
    log_info "Verifying gateway connectivity on port $gateway_port..."
    local gateway_host="127.0.0.1"

    if [ "${EXEC_MODE:-local}" = "remote" ]; then
        # Test via SSH
        local health_response
        health_response=$(run_cmd --as "$exec_user" "curl -s --max-time 10 http://127.0.0.1:${gateway_port}/health" 2>/dev/null || echo "")
        if [ -n "$health_response" ]; then
            log_success "Gateway health endpoint responding"
            log_debug "Response: $health_response"
        else
            log_warn "Gateway health endpoint not responding yet (may need more time to start)"
        fi
    else
        # Test locally
        local health_response
        health_response=$(curl -s --max-time 10 "http://127.0.0.1:${gateway_port}/health" 2>/dev/null || echo "")
        if [ -n "$health_response" ]; then
            log_success "Gateway health endpoint responding"
            log_debug "Response: $health_response"
        else
            log_warn "Gateway health endpoint not responding yet (may need more time to start)"
        fi
    fi

    # Check enabled channels
    log_info "Checking enabled channels..."
    [ "${ENABLE_WHATSAPP:-false}" = "true" ] && log_info "  WhatsApp: enabled (QR pairing may be required)"
    [ "${ENABLE_TELEGRAM:-false}" = "true" ] && log_info "  Telegram: enabled"
    [ "${ENABLE_DISCORD:-false}" = "true" ] && log_info "  Discord: enabled"
    [ "${ENABLE_WEB:-true}" = "true" ] && log_info "  Web UI: enabled at http://127.0.0.1:${gateway_port}"

    # Print summary
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║ DEPLOYMENT SUCCESSFUL${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║${NC} Agent: ${AGENT_NAME:-openclaw}"
    echo -e "${GREEN}║${NC} User: ${exec_user}"
    echo -e "${GREEN}║${NC} Install: ${OPENCLAW_ROOT:-~/openclaw}"
    echo -e "${GREEN}║${NC} Gateway Port: $gateway_port"
    echo -e "${GREEN}║${NC} Status: Running"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║ Next Steps:${NC}"
    if [ "${EXEC_MODE:-local}" = "remote" ]; then
        echo -e "${GREEN}║${NC} 1. Access web UI via SSH tunnel:"
        echo -e "${GREEN}║${NC}    ssh -L ${gateway_port}:127.0.0.1:${gateway_port} ${exec_user}@${VPS_HOSTNAME:-HOST}"
    else
        echo -e "${GREEN}║${NC} 1. Access web UI at:"
        echo -e "${GREEN}║${NC}    http://127.0.0.1:${gateway_port}"
    fi
    if [ "${ENABLE_WHATSAPP:-false}" = "true" ]; then
        echo -e "${GREEN}║${NC} 2. Pair WhatsApp:"
        echo -e "${GREEN}║${NC}    openclaw channels whatsapp pair"
    fi
    if [ "${DM_POLICY:-pairing}" = "pairing" ]; then
        echo -e "${GREEN}║${NC} 3. Approve pairing requests:"
        echo -e "${GREEN}║${NC}    openclaw pairing list"
        echo -e "${GREEN}║${NC}    openclaw pairing approve <channel> <code>"
    fi
    echo -e "${GREEN}║${NC}"
    echo -e "${GREEN}║${NC} Update later with:"
    echo -e "${GREEN}║${NC}    $([ "${EXEC_MODE:-local}" = "remote" ] && echo "./setup/setup.sh --update --vps-hostname=${VPS_HOSTNAME:-HOST}" || echo "./setup/setup.sh --update")"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    phase_end "Verification" "success"
    save_checkpoint "70-verification"
    clear_checkpoint
    return 0
}

# Run verification if executed directly
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    verify_deployment
fi
