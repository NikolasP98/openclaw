#!/usr/bin/env bash
# ---
# name: "Tailscale Funnel Setup"
# phase: 65
# description: >
#   Configures Tailscale Funnel to expose the Minion gateway and OAuth callback
#   server publicly over HTTPS. Required for Google OAuth (and any other service
#   whose redirect_uri must be a public HTTPS URL, not a LAN/tailnet address).
#   Skipped automatically if TAILSCALE_FUNNEL_ENABLED is not "true".
# when: >
#   After service is started (Phase 60). Needs a running gateway to proxy to.
#   Must be done BEFORE Phase 70 verification so the public URL is live.
# requires:
#   - "Phase 60 (service setup) completed"
#   - "Tailscale installed and authenticated on the server"
#   - "TAILSCALE_FUNNEL_ENABLED=true (pass --tailscale-funnel to setup.sh)"
# produces:
#   - "HTTPS Funnel exposing / → gateway (port GATEWAY_PORT)"
#   - "HTTPS Funnel exposing /oauth-callback → OAuth server (port OAUTH_CALLBACK_PORT)"
# flags:
#   -v, --verbose: "Enable debug-level logging"
# idempotent: true
# estimated_time: "0.5 minutes"
# ---

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/logging.sh"
source "${SCRIPT_DIR}/../lib/variables.sh"
source "${SCRIPT_DIR}/../lib/network.sh"

# Ensure derived variables are populated (idempotent)
derive_system_variables

setup_tailscale_funnel() {
    phase_start "Tailscale Funnel Setup" "65"

    # Skip if not requested
    if [ "${TAILSCALE_FUNNEL_ENABLED:-false}" != "true" ]; then
        log_info "Tailscale Funnel not requested (pass --tailscale-funnel to enable)"
        log_info "Note: Funnel is required for Google OAuth callbacks and other public HTTPS redirects"
        phase_end "Tailscale Funnel Setup" "skipped"
        save_checkpoint "65-tailscale-funnel"
        return 0
    fi

    local gateway_port="${GATEWAY_PORT:-18789}"
    local oauth_port="${OAUTH_CALLBACK_PORT:-51234}"

    # Verify Tailscale is installed
    log_info "Checking Tailscale installation..."
    local ts_installed
    if [ "${EXEC_MODE:-local}" = "remote" ]; then
        ts_installed=$(run_cmd "which tailscale 2>/dev/null && echo ok || echo missing")
    else
        ts_installed=$(which tailscale 2>/dev/null && echo ok || echo missing)
    fi

    if [ "$ts_installed" = "missing" ]; then
        log_error "Tailscale is not installed on the target server"
        log_error "Install it first: curl -fsSL https://tailscale.com/install.sh | sh"
        handle_error 1 "Tailscale not installed" "Tailscale Funnel Setup"
        return 1
    fi
    log_success "Tailscale found"

    # Verify Tailscale is authenticated and get the node FQDN
    log_info "Checking Tailscale authentication..."
    local ts_status
    if [ "${EXEC_MODE:-local}" = "remote" ]; then
        ts_status=$(run_cmd "tailscale status --json 2>/dev/null | python3 -c \"import sys,json; d=json.load(sys.stdin); print('ok' if d.get('BackendState')=='Running' else 'not-running')\" 2>/dev/null || echo error")
    else
        ts_status=$(tailscale status --json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('BackendState')=='Running' else 'not-running')" 2>/dev/null || echo error)
    fi

    if [ "$ts_status" != "ok" ]; then
        if [ -n "${TAILSCALE_AUTH_KEY:-}" ]; then
            log_info "Tailscale not running — authenticating with provided key..."
            if [ "${EXEC_MODE:-local}" = "remote" ]; then
                run_cmd "tailscale up --authkey=${TAILSCALE_AUTH_KEY} --ssh 2>&1" || true
            else
                sudo tailscale up --authkey="${TAILSCALE_AUTH_KEY}" --ssh 2>&1 || true
            fi
            sleep 3
        else
            log_error "Tailscale is not authenticated. Provide --tailscale-key=KEY or authenticate manually first."
            handle_error 1 "Tailscale not authenticated" "Tailscale Funnel Setup"
            return 1
        fi
    fi
    log_success "Tailscale is authenticated"

    # Get the server's Tailscale FQDN for display
    local ts_fqdn=""
    if [ "${EXEC_MODE:-local}" = "remote" ]; then
        ts_fqdn=$(run_cmd "tailscale status --json 2>/dev/null | python3 -c \"import sys,json; d=json.load(sys.stdin); me=d.get('Self',{}); print(me.get('DNSName','').rstrip('.'))\" 2>/dev/null" || echo "")
    else
        ts_fqdn=$(tailscale status --json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); me=d.get('Self',{}); print(me.get('DNSName','').rstrip('.'))" 2>/dev/null || echo "")
    fi

    # Configure Funnel routes (idempotent — --set-path overwrites existing config)
    # IMPORTANT: Do NOT use 'tailscale serve' alongside funnel — it removes the Funnel flag.
    # Always use 'tailscale funnel' for both routes on this server.
    log_info "Configuring Tailscale Funnel routes..."

    # Route / → gateway
    log_info "  / → http://127.0.0.1:${gateway_port}"
    if [ "${EXEC_MODE:-local}" = "remote" ]; then
        if ! run_cmd "tailscale funnel --bg --set-path / http://127.0.0.1:${gateway_port} 2>&1"; then
            log_warn "Gateway funnel route setup returned non-zero (may already be configured)"
        fi
    else
        if ! sudo tailscale funnel --bg --set-path / "http://127.0.0.1:${gateway_port}" 2>&1; then
            log_warn "Gateway funnel route setup returned non-zero (may already be configured)"
        fi
    fi

    # Route /oauth-callback → OAuth callback server
    log_info "  /oauth-callback → http://127.0.0.1:${oauth_port}/oauth-callback"
    if [ "${EXEC_MODE:-local}" = "remote" ]; then
        if ! run_cmd "tailscale funnel --bg --set-path /oauth-callback http://127.0.0.1:${oauth_port}/oauth-callback 2>&1"; then
            log_warn "OAuth callback funnel route setup returned non-zero (may already be configured)"
        fi
    else
        if ! sudo tailscale funnel --bg --set-path /oauth-callback "http://127.0.0.1:${oauth_port}/oauth-callback" 2>&1; then
            log_warn "OAuth callback funnel route setup returned non-zero (may already be configured)"
        fi
    fi

    log_success "Funnel routes configured"

    # Display the funnel status so the operator can verify
    log_info "Current Tailscale Funnel status:"
    if [ "${EXEC_MODE:-local}" = "remote" ]; then
        run_cmd "tailscale funnel status 2>&1" || true
    else
        sudo tailscale funnel status 2>&1 || true
    fi

    # Print summary
    echo ""
    if [ -n "$ts_fqdn" ]; then
        log_success "Tailscale Funnel is live at: https://${ts_fqdn}"
        log_info "  Gateway:        https://${ts_fqdn}/"
        log_info "  OAuth callback: https://${ts_fqdn}/oauth-callback"
        log_info ""
        log_info "Set this in your gogOAuth config:"
        log_info "  hooks.gogOAuth.externalRedirectUri: \"https://${ts_fqdn}/oauth-callback\""
    else
        log_success "Tailscale Funnel configured (FQDN detection failed — check 'tailscale status')"
    fi
    echo ""

    # Caution reminder about tailscale serve
    log_warn "IMPORTANT: Do NOT run 'tailscale serve' on this server — it will remove Funnel access."
    log_warn "           Always use 'tailscale funnel' for all route configuration."

    phase_end "Tailscale Funnel Setup" "success"
    save_checkpoint "65-tailscale-funnel"
    return 0
}

# Run if executed directly
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    setup_tailscale_funnel
fi
