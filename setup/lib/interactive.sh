#!/usr/bin/env bash
# ---
# name: "Interactive Wizard Library"
# description: >
#   Provides an interactive setup wizard for the Minion setup framework.
#   Guides the operator through all configuration steps with sensible defaults,
#   pre-filled values from CLI flags, secret masking, and a final confirmation
#   summary before proceeding.
# produces:
#   - "Wizard functions: wizard_prompt, wizard_prompt_secret, wizard_prompt_bool"
#   - "Wizard functions: wizard_prompt_choice, wizard_section, wizard_confirm_config"
#   - "Main entry point: run_interactive_wizard"
# ---

# ---------------------------------------------------------------------------
# Color codes (inherit from logging.sh if already loaded, else define here)
# ---------------------------------------------------------------------------
RED="${RED:-\033[0;31m}"
GREEN="${GREEN:-\033[0;32m}"
YELLOW="${YELLOW:-\033[1;33m}"
BLUE="${BLUE:-\033[0;34m}"
CYAN="${CYAN:-\033[0;36m}"
BOLD="${BOLD:-\033[1m}"
DIM="${DIM:-\033[2m}"
NC="${NC:-\033[0m}"

# ---------------------------------------------------------------------------
# wizard_section TITLE [step] [total]
#   Prints a styled section header to stdout.
# ---------------------------------------------------------------------------
wizard_section() {
    local title="$1"
    local step="${2:-}"
    local total="${3:-}"
    local step_label=""

    if [ -n "$step" ] && [ -n "$total" ]; then
        step_label=" — Step ${step} of ${total}"
    fi

    printf "\n"
    printf "${CYAN}┌─────────────────────────────────────────────────────────────┐${NC}\n"
    printf "${CYAN}│${NC} ${BOLD}%s${NC}${DIM}%s${NC}\n" "$title" "$step_label"
    printf "${CYAN}└─────────────────────────────────────────────────────────────┘${NC}\n"
    printf "\n"
}

# ---------------------------------------------------------------------------
# wizard_prompt VAR_NAME LABEL DEFAULT
#   Prompts for a plain-text string value.
#   - If $VAR_NAME is already set (from CLI flags), shows it as the default.
#   - Enter keeps the current/default value.
#   - Sets eval "$VAR_NAME=$input"
# ---------------------------------------------------------------------------
wizard_prompt() {
    local var_name="$1"
    local label="$2"
    local default="${3:-}"
    local current_val
    local input

    # Get the current value of the variable (if set via CLI flags)
    current_val="${!var_name:-}"

    # Determine the effective default to show
    local effective_default="${current_val:-$default}"

    if [ -n "$effective_default" ]; then
        printf "  ${BLUE}%s${NC} [${effective_default}]: " "$label"
    else
        printf "  ${BLUE}%s${NC}: " "$label"
    fi

    read -r input

    # If empty, use the effective default
    if [ -z "$input" ]; then
        input="$effective_default"
    fi

    eval "$var_name=\"\$input\""
}

# ---------------------------------------------------------------------------
# wizard_prompt_secret VAR_NAME LABEL REQUIRED
#   Prompts for a secret value (no echo).
#   - If already set, shows a placeholder message without revealing the value.
#   - REQUIRED="true" loops until non-empty.
# ---------------------------------------------------------------------------
wizard_prompt_secret() {
    local var_name="$1"
    local label="$2"
    local required="${3:-false}"
    local current_val
    local input

    current_val="${!var_name:-}"

    while true; do
        if [ -n "$current_val" ]; then
            printf "  ${BLUE}%s${NC} ${DIM}[already set — press Enter to keep, or type new value]${NC}: " "$label"
        elif [ "$required" = "true" ]; then
            printf "  ${BLUE}%s${NC} ${YELLOW}(required)${NC}: " "$label"
        else
            printf "  ${BLUE}%s${NC} ${DIM}(press Enter to skip)${NC}: " "$label"
        fi

        read -rs input
        printf "\n"

        if [ -z "$input" ]; then
            # Keep existing value
            if [ -n "$current_val" ]; then
                # Variable already set — leave it unchanged
                break
            elif [ "$required" = "true" ]; then
                printf "  ${RED}This field is required. Please enter a value.${NC}\n"
                continue
            else
                # Optional, skip
                eval "$var_name=\"\""
                break
            fi
        else
            eval "$var_name=\"\$input\""
            break
        fi
    done
}

# ---------------------------------------------------------------------------
# wizard_prompt_bool VAR_NAME LABEL DEFAULT
#   Prompts for a yes/no answer.
#   DEFAULT="true"  → shows [Y/n]
#   DEFAULT="false" → shows [y/N]
#   Sets variable to "true" or "false".
# ---------------------------------------------------------------------------
wizard_prompt_bool() {
    local var_name="$1"
    local label="$2"
    local default="${3:-false}"
    local current_val
    local input
    local prompt_hint

    current_val="${!var_name:-}"

    # Use the current value as the effective default if set
    local effective_default="${current_val:-$default}"

    if [ "$effective_default" = "true" ]; then
        prompt_hint="[Y/n]"
    else
        prompt_hint="[y/N]"
    fi

    while true; do
        printf "  ${BLUE}%s${NC} %s: " "$label" "$prompt_hint"
        read -r input
        input="${input,,}"  # lowercase

        if [ -z "$input" ]; then
            eval "$var_name=\"\$effective_default\""
            break
        elif [ "$input" = "y" ] || [ "$input" = "yes" ]; then
            eval "$var_name=\"true\""
            break
        elif [ "$input" = "n" ] || [ "$input" = "no" ]; then
            eval "$var_name=\"false\""
            break
        else
            printf "  ${YELLOW}Please enter y or n.${NC}\n"
        fi
    done
}

# ---------------------------------------------------------------------------
# wizard_prompt_choice VAR_NAME LABEL OPTIONS DEFAULT
#   OPTIONS is a pipe-delimited string, e.g. "package|source"
#   Displays: [package/source] (package):
#   Loops until a valid option is entered.
# ---------------------------------------------------------------------------
wizard_prompt_choice() {
    local var_name="$1"
    local label="$2"
    local options_str="$3"
    local default="${4:-}"
    local current_val
    local input

    current_val="${!var_name:-}"
    local effective_default="${current_val:-$default}"

    # Build the display string: "package/source"
    local display_options="${options_str//|//}"

    # Build an array from the pipe-delimited options
    IFS='|' read -ra options_arr <<< "$options_str"

    while true; do
        if [ -n "$effective_default" ]; then
            printf "  ${BLUE}%s${NC} [%s] (${effective_default}): " "$label" "$display_options"
        else
            printf "  ${BLUE}%s${NC} [%s]: " "$label" "$display_options"
        fi

        read -r input

        if [ -z "$input" ]; then
            input="$effective_default"
        fi

        # Validate against options
        local valid=false
        for opt in "${options_arr[@]}"; do
            if [ "$input" = "$opt" ]; then
                valid=true
                break
            fi
        done

        if [ "$valid" = "true" ]; then
            eval "$var_name=\"\$input\""
            break
        else
            printf "  ${YELLOW}Invalid choice '%s'. Valid options: %s${NC}\n" "$input" "$display_options"
        fi
    done
}

# ---------------------------------------------------------------------------
# _wizard_show_key_status KEY_NAME VALUE
#   Internal helper: prints "✓ set" in green or "✗ not set" in red.
# ---------------------------------------------------------------------------
_wizard_show_key_status() {
    local name="$1"
    local value="$2"
    if [ -n "$value" ]; then
        printf "    %-30s ${GREEN}✓ set${NC}\n" "$name"
    else
        printf "    %-30s ${RED}✗ not set${NC}\n" "$name"
    fi
}

# ---------------------------------------------------------------------------
# _wizard_bool_display VALUE
#   Returns "enabled" (green) or "disabled" (dim).
# ---------------------------------------------------------------------------
_wizard_bool_display() {
    local value="$1"
    if [ "$value" = "true" ]; then
        printf "${GREEN}enabled${NC}"
    else
        printf "${DIM}disabled${NC}"
    fi
}

# ---------------------------------------------------------------------------
# wizard_confirm_config
#   Prints a full configuration summary and asks the operator to confirm.
#   Returns 0 if confirmed, 1 if aborted.
# ---------------------------------------------------------------------------
wizard_confirm_config() {
    printf "\n"
    printf "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}\n"
    printf "${BOLD}${CYAN}║           CONFIGURATION SUMMARY                              ║${NC}\n"
    printf "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}\n"
    printf "\n"

    # --- Target Server ---
    printf "  ${BOLD}${BLUE}Target Server${NC}\n"
    printf "    %-30s %s\n" "VPS Hostname" "${VPS_HOSTNAME:-${DIM}(not set)${NC}}"
    printf "    %-30s %s\n" "Admin SSH User" "${EXEC_USER:-root}"
    printf "    %-30s %s\n" "Exec Mode" "${EXEC_MODE:-remote}"
    printf "\n"

    # --- Install Method ---
    printf "  ${BOLD}${BLUE}Install Method${NC}\n"
    printf "    %-30s %s\n" "Method" "${INSTALL_METHOD:-package}"
    if [ "${INSTALL_METHOD:-package}" = "source" ]; then
        printf "    %-30s %s\n" "GitHub Repo" "${GITHUB_REPO:-NikolasP98/minion}"
        printf "    %-30s %s\n" "Branch" "${GITHUB_BRANCH:-main}"
    else
        printf "    %-30s %s\n" "Package Manager" "${PACKAGE_MANAGER:-npm}"
    fi
    printf "\n"

    # --- Agent Identity ---
    printf "  ${BOLD}${BLUE}Agent Identity${NC}\n"
    printf "    %-30s %s\n" "Agent Name" "${AGENT_NAME:-minion}"
    printf "    %-30s %s\n" "Personality" "${AGENT_PERSONALITY:-${DIM}(none)${NC}}"
    printf "\n"

    # --- Gateway ---
    printf "  ${BOLD}${BLUE}Gateway${NC}\n"
    printf "    %-30s %s\n" "Port" "${GATEWAY_PORT:-18789}"
    printf "    %-30s %s\n" "Bind" "${GATEWAY_BIND:-loopback}"
    printf "\n"

    # --- API Keys ---
    printf "  ${BOLD}${BLUE}API Keys${NC}\n"
    _wizard_show_key_status "Anthropic API Key" "${ANTHROPIC_API_KEY:-}"
    _wizard_show_key_status "OpenRouter API Key" "${OPENROUTER_API_KEY:-}"
    _wizard_show_key_status "GitHub PAT" "${GITHUB_PAT:-}"
    printf "\n"

    # --- Channels ---
    printf "  ${BOLD}${BLUE}Channels${NC}\n"
    printf "    %-30s " "WhatsApp"
    _wizard_bool_display "${ENABLE_WHATSAPP:-false}"
    printf "\n"
    if [ "${ENABLE_WHATSAPP:-false}" = "true" ] && [ -n "${WHATSAPP_PHONE:-}" ]; then
        printf "    %-30s %s\n" "  Phone Number" "${WHATSAPP_PHONE}"
    fi
    printf "    %-30s " "Telegram"
    _wizard_bool_display "${ENABLE_TELEGRAM:-false}"
    printf "\n"
    if [ "${ENABLE_TELEGRAM:-false}" = "true" ]; then
        _wizard_show_key_status "  Telegram Bot Token" "${TELEGRAM_BOT_TOKEN:-}"
    fi
    printf "    %-30s " "Discord"
    _wizard_bool_display "${ENABLE_DISCORD:-false}"
    printf "\n"
    if [ "${ENABLE_DISCORD:-false}" = "true" ]; then
        _wizard_show_key_status "  Discord Bot Token" "${DISCORD_BOT_TOKEN:-}"
    fi
    printf "\n"

    # --- Security ---
    printf "  ${BOLD}${BLUE}Security${NC}\n"
    printf "    %-30s %s\n" "Sandbox Mode" "${SANDBOX_MODE:-non-main}"
    printf "    %-30s %s\n" "DM Policy" "${DM_POLICY:-pairing}"
    printf "\n"

    # --- Tailscale & OAuth ---
    printf "  ${BOLD}${BLUE}Tailscale & OAuth${NC}\n"
    printf "    %-30s " "Tailscale Funnel"
    _wizard_bool_display "${TAILSCALE_FUNNEL_ENABLED:-false}"
    printf "\n"
    if [ "${TAILSCALE_FUNNEL_ENABLED:-false}" = "true" ]; then
        _wizard_show_key_status "  Tailscale Auth Key" "${TAILSCALE_AUTH_KEY:-}"
        printf "    %-30s %s\n" "  OAuth Callback Port" "${OAUTH_CALLBACK_PORT:-51234}"
    fi
    printf "\n"

    printf "${CYAN}──────────────────────────────────────────────────────────────${NC}\n"
    printf "\n"

    local confirm_input
    while true; do
        printf "  ${BOLD}Proceed with this configuration?${NC} [Y/n]: "
        read -r confirm_input
        confirm_input="${confirm_input,,}"

        if [ -z "$confirm_input" ] || [ "$confirm_input" = "y" ] || [ "$confirm_input" = "yes" ]; then
            printf "\n  ${GREEN}Configuration confirmed. Proceeding with setup...${NC}\n\n"
            return 0
        elif [ "$confirm_input" = "n" ] || [ "$confirm_input" = "no" ]; then
            printf "\n"
            local restart_input
            printf "  Restart the wizard from the beginning? [y/N]: "
            read -r restart_input
            restart_input="${restart_input,,}"
            if [ "$restart_input" = "y" ] || [ "$restart_input" = "yes" ]; then
                return 2  # Signal: restart wizard
            else
                printf "  ${YELLOW}Setup aborted by operator.${NC}\n\n"
                return 1  # Signal: abort
            fi
        else
            printf "  ${YELLOW}Please enter y or n.${NC}\n"
        fi
    done
}

# ---------------------------------------------------------------------------
# run_interactive_wizard
#   Main wizard entry point. Runs all 8 configuration steps in sequence.
#   Must be called with an interactive terminal (stdin = tty).
# ---------------------------------------------------------------------------
run_interactive_wizard() {
    # Safety check: must have an interactive terminal
    if [ ! -t 0 ]; then
        printf "${RED}ERROR:${NC} The interactive wizard requires an interactive terminal.\n" >&2
        printf "       stdin is not a TTY. Use --non-interactive to provide all values via flags.\n" >&2
        return 1
    fi

    local wizard_done=false

    while [ "$wizard_done" = "false" ]; do
        _run_wizard_steps
        local wizard_exit=$?

        case $wizard_exit in
            0)
                wizard_done=true
                ;;
            2)
                # Restart requested
                printf "  ${CYAN}Restarting wizard...${NC}\n\n"
                ;;
            *)
                # Aborted
                return 1
                ;;
        esac
    done

    return 0
}

# ---------------------------------------------------------------------------
# _run_wizard_steps
#   Internal: runs all steps and calls wizard_confirm_config at the end.
#   Returns the exit code from wizard_confirm_config.
# ---------------------------------------------------------------------------
_run_wizard_steps() {
    local total_steps=8

    # =========================================================================
    # Banner
    # =========================================================================
    printf "\n"
    printf "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}\n"
    printf "${BOLD}${CYAN}║       Minion Setup Wizard — Interactive Mode                 ║${NC}\n"
    printf "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}\n"
    printf "\n"
    printf "  ${DIM}This wizard will guide you through all configuration steps.${NC}\n"
    printf "  ${DIM}Press Enter to accept the default value shown in brackets.${NC}\n"
    printf "  ${DIM}Values pre-filled from CLI flags are shown as defaults.${NC}\n"

    # =========================================================================
    # Step 1: Target Server
    # =========================================================================
    wizard_section "Target Server" 1 "$total_steps"

    # VPS_HOSTNAME — required for remote mode
    local _hostname_set=false
    while true; do
        wizard_prompt "VPS_HOSTNAME" "VPS hostname or IP" ""
        if [ -n "${VPS_HOSTNAME:-}" ]; then
            _hostname_set=true
            break
        else
            printf "  ${YELLOW}A target hostname or IP address is required for remote deployment.${NC}\n"
            printf "  ${DIM}(Enter the IP address or hostname of your VPS/server)${NC}\n"
        fi
    done

    # Auto-derive exec mode
    EXEC_MODE="remote"

    # Admin SSH user
    wizard_prompt "EXEC_USER" "Admin SSH user" "root"
    : "${EXEC_USER:=root}"

    printf "\n  ${DIM}Target: ${NC}${BOLD}${EXEC_USER}@${VPS_HOSTNAME}${NC}\n"

    # =========================================================================
    # Step 2: Install Method
    # =========================================================================
    wizard_section "Install Method" 2 "$total_steps"

    wizard_prompt_choice "INSTALL_METHOD" "Install method" "package|source" "package"

    if [ "${INSTALL_METHOD}" = "source" ]; then
        printf "\n  ${DIM}Building from source requires Git access to the repository.${NC}\n\n"
        wizard_prompt "GITHUB_REPO" "GitHub repository (owner/repo)" "NikolasP98/minion"
        : "${GITHUB_REPO:=NikolasP98/minion}"
        wizard_prompt "GITHUB_BRANCH" "Branch to deploy" "main"
        : "${GITHUB_BRANCH:=main}"
    else
        printf "\n"
        wizard_prompt_choice "PACKAGE_MANAGER" "Package manager" "npm|pnpm|bun" "npm"
    fi

    # =========================================================================
    # Step 3: API Keys
    # =========================================================================
    wizard_section "API Keys" 3 "$total_steps"

    printf "  ${DIM}The Anthropic API key is required for agent operation.${NC}\n"
    printf "  ${DIM}OpenRouter and GitHub PAT are optional enhancements.${NC}\n\n"

    wizard_prompt_secret "ANTHROPIC_API_KEY" "Anthropic API Key" "true"
    wizard_prompt_secret "OPENROUTER_API_KEY" "OpenRouter API Key" "false"
    wizard_prompt_secret "GITHUB_PAT" "GitHub Personal Access Token" "false"

    # =========================================================================
    # Step 4: Gateway
    # =========================================================================
    wizard_section "Gateway Configuration" 4 "$total_steps"

    wizard_prompt "GATEWAY_PORT" "Gateway port" "18789"
    : "${GATEWAY_PORT:=18789}"

    wizard_prompt_choice "GATEWAY_BIND" "Gateway bind interface" "loopback|lan|tailnet" "loopback"

    if [ "${GATEWAY_BIND}" = "loopback" ]; then
        printf "\n  ${YELLOW}Note:${NC} ${DIM}With loopback binding, the gateway is only reachable via${NC}\n"
        printf "  ${DIM}SSH tunnel or Tailscale. Not directly accessible from LAN.${NC}\n"
    fi

    # =========================================================================
    # Step 5: Agent Identity
    # =========================================================================
    wizard_section "Agent Identity" 5 "$total_steps"

    wizard_prompt "AGENT_NAME" "Agent name" "minion"
    : "${AGENT_NAME:=minion}"

    printf "  ${DIM}Personality is optional — a brief description of the agent's character.${NC}\n"
    wizard_prompt "AGENT_PERSONALITY" "Agent personality" ""

    # =========================================================================
    # Step 6: Channels
    # =========================================================================
    wizard_section "Communication Channels" 6 "$total_steps"

    printf "  ${DIM}Enable the channels through which the agent will receive messages.${NC}\n\n"

    # WhatsApp
    wizard_prompt_bool "ENABLE_WHATSAPP" "Enable WhatsApp (via WATI)" "false"
    if [ "${ENABLE_WHATSAPP}" = "true" ]; then
        wizard_prompt "WHATSAPP_PHONE" "WhatsApp phone number (E.164 format, e.g. +15551234567)" ""
    fi

    printf "\n"

    # Telegram
    wizard_prompt_bool "ENABLE_TELEGRAM" "Enable Telegram" "false"
    if [ "${ENABLE_TELEGRAM}" = "true" ]; then
        wizard_prompt_secret "TELEGRAM_BOT_TOKEN" "Telegram Bot Token" "false"
    fi

    printf "\n"

    # Discord
    wizard_prompt_bool "ENABLE_DISCORD" "Enable Discord" "false"
    if [ "${ENABLE_DISCORD}" = "true" ]; then
        wizard_prompt_secret "DISCORD_BOT_TOKEN" "Discord Bot Token" "false"
    fi

    # =========================================================================
    # Step 7: Security
    # =========================================================================
    wizard_section "Security & Policy" 7 "$total_steps"

    printf "  ${DIM}Sandbox mode controls which agent sessions run in a sandboxed environment:${NC}\n"
    printf "    ${DIM}off      — no restrictions, agents run with full access${NC}\n"
    printf "    ${DIM}non-main — sandbox non-primary sessions (recommended)${NC}\n"
    printf "    ${DIM}all      — sandbox every session including the main one${NC}\n\n"

    wizard_prompt_choice "SANDBOX_MODE" "Sandbox mode" "off|non-main|all" "non-main"

    printf "\n"
    printf "  ${DIM}DM policy controls who can send direct messages to the agent:${NC}\n"
    printf "    ${DIM}open    — anyone can send a DM to the agent${NC}\n"
    printf "    ${DIM}pairing — users must be approved/paired before messaging${NC}\n\n"

    wizard_prompt_choice "DM_POLICY" "DM policy" "open|pairing" "pairing"

    # =========================================================================
    # Step 8: Tailscale & Google OAuth
    # =========================================================================
    wizard_section "Tailscale & Google OAuth" 8 "$total_steps"

    printf "  ${DIM}Tailscale Funnel exposes the gateway publicly over HTTPS.${NC}\n"
    printf "  ${YELLOW}Required${NC} ${DIM}for Google OAuth (Drive, Gmail, Calendar) and other${NC}\n"
    printf "  ${DIM}integrations that need a public HTTPS callback URL.${NC}\n\n"

    wizard_prompt_bool "TAILSCALE_FUNNEL_ENABLED" "Enable Tailscale Funnel" "false"

    if [ "${TAILSCALE_FUNNEL_ENABLED}" = "true" ]; then
        printf "\n"
        printf "  ${DIM}Tailscale auth key is optional if the server is already authenticated.${NC}\n"
        printf "  ${DIM}Leave blank to skip (the setup phase will prompt for auth interactively).${NC}\n\n"
        wizard_prompt_secret "TAILSCALE_AUTH_KEY" "Tailscale Auth Key" "false"

        printf "\n"
        wizard_prompt "OAUTH_CALLBACK_PORT" "OAuth callback port" "51234"
        : "${OAUTH_CALLBACK_PORT:=51234}"
    fi

    # =========================================================================
    # Confirmation
    # =========================================================================
    wizard_confirm_config
    return $?
}

# ---------------------------------------------------------------------------
# Exports
# ---------------------------------------------------------------------------
export -f wizard_prompt wizard_prompt_secret wizard_prompt_bool wizard_prompt_choice
export -f wizard_section wizard_confirm_config run_interactive_wizard
export -f _wizard_show_key_status _wizard_bool_display _run_wizard_steps
