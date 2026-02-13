# OpenClaw Setup Framework

VPS user-level deployment via `git clone` + `pnpm install` + `pnpm build`.
Deploys OpenClaw as a systemd user service with idempotent, resumable phases.

## Table of Contents

- [Quick Start](#quick-start)
- [Execution Modes](#execution-modes)
- [Phases](#phases)
- [Customization](#customization)
- [External Agent Profiles (Minions)](#external-agent-profiles-minions)
- [Architecture](#architecture)
- [Library Reference](#library-reference)
- [Utilities](#utilities)
- [Configuration Files](#configuration-files)
- [Directory Layout](#directory-layout)
- [Flags Reference](#flags-reference)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# Local mode — run directly on the VPS
./setup/setup.sh --api-key=sk-ant-xxx --agent-name=mybot

# Remote mode — orchestrate from your local machine via SSH
./setup/setup.sh --vps-hostname=server.example.com \
  --api-key=sk-ant-xxx --github-pat=ghp_xxx --agent-name=mybot

# Using a profile
./setup/setup.sh --profile=customer-support --api-key=sk-ant-xxx

# Using an external profile from minions repo
./setup/setup.sh --profile=~/minions/profiles/customer-support.yaml \
  --api-key=sk-ant-xxx --vps-hostname=server.example.com

# Update an existing install
./setup/setup.sh --update --verbose

# Decommission — stop services, free disk, preserve config
./setup/setup.sh --decommission --agent-name=mybot

# Dry run — show what would happen
./setup/setup.sh --dry-run --api-key=sk-ant-test --verbose
```

---

## Execution Modes

| Mode       | Flag                                     | When to use                                   |
| ---------- | ---------------------------------------- | --------------------------------------------- |
| **local**  | `--mode=local` (default)                 | Running directly on the VPS                   |
| **remote** | `--mode=remote` or `--vps-hostname=HOST` | Orchestrating from your local machine via SSH |

### Auto-detection

Mode is determined automatically when `--mode` is omitted:

- If `--vps-hostname` is provided → **remote**
- Otherwise → **local**

In **remote mode**, all commands are executed over SSH to the target host. File
transfers use SCP. The orchestrator runs on your local machine and the VPS only
needs `git`, `curl`, and an SSH server.

In **local mode**, commands execute directly on the current machine via `bash -c`.
No SSH is involved.

---

## Phases

### Overview

| Phase | Script              | Purpose                                                         | Est. Time |
| ----- | ------------------- | --------------------------------------------------------------- | --------- |
| 00    | `preflight`         | Validate variables, test connectivity, verify tools             | 0.5–1 min |
| 20    | `user-creation`     | Create agent user/dirs, enable systemd lingering                | 0.5–1 min |
| 30    | `environment-setup` | Install Node.js, pnpm (corepack), gh CLI, build tools           | 2–5 min   |
| 40    | `openclaw-install`  | `git clone` + `pnpm install` + `pnpm build`                     | 3–8 min   |
| 45    | `alias-setup`       | Create `~/.local/bin/openclaw` wrapper, update PATH             | 0.5 min   |
| 50    | `config-generation` | Render templates → `openclaw.json`, systemd service, `SOUL.md`  | 1–2 min   |
| 60    | `service-setup`     | Reload systemd, enable and start gateway service                | 1–2 min   |
| 70    | `verification`      | Health checks, wrapper test, deployment summary                 | 0.5–1 min |
| 95    | `decommission`      | Stop service, free disk, preserve config (via `--decommission`) | 0.5 min   |
| 99    | `rollback`          | Cascading cleanup on failure (automatic or manual)              | 1–2 min   |

Resume from any phase with `--start-from=40` or skip phases with `--skip-phase=30`.

### Phase Details

#### Phase 00 — Preflight Checks

**Purpose:** Validates the environment before making any changes.

**What it does:**

- Checks all required variables are set (mode-aware: remote requires `VPS_HOSTNAME`)
- Validates `ANTHROPIC_API_KEY` format (must start with `sk-ant-`)
- Validates `GITHUB_PAT` format if provided (warns on mismatch, continues)
- Validates `AGENT_USERNAME` format (lowercase, starts with letter, max 32 chars)
- Remote mode: tests SSH connection, checks for `git`/`curl` on target
- Local mode: checks for `git`/`curl` locally, reports Node.js/pnpm if found
- Displays full configuration summary (sensitive values masked)

**Inputs:** All configuration variables (via flags, profile, or defaults)
**Outputs:** Validated configuration, checkpoint `00-preflight`
**Idempotent:** Yes — read-only checks, no side effects

#### Phase 20 — User Creation

**Purpose:** Creates the agent user account and directory structure.

**What it does:**

- Remote mode: creates system user via `useradd`, sets up home directory
- Local mode: skips user creation (already running as the user), creates directories
- Creates directories: `~/.openclaw/workspace/`, `~/.openclaw/credentials/`, `~/.local/bin/`, `~/.config/systemd/user/`
- Sets permissions: `700` on `.openclaw/` and `credentials/`
- Enables systemd lingering via `loginctl enable-linger`

**Inputs:** `AGENT_USERNAME`, `AGENT_HOME_DIR` (derived from `AGENT_NAME`)
**Outputs:** User account (remote), directory structure, checkpoint `20-user-creation`
**Idempotent:** Yes — skips if user exists, `mkdir -p` for directories

#### Phase 30 — Environment Setup

**Purpose:** Installs the Node.js/pnpm toolchain and build dependencies.

**What it does:**

- Installs Node.js 22 via the configured method:
  - `apt` (default): NodeSource repository
  - `nvm`: NVM 0.40.0 + `nvm install 22`
  - `skip`: assumes Node.js is already installed
- Sets up pnpm via corepack, falls back to `npm install -g pnpm@10.23.0`
- Installs gh CLI from the GitHub APT repository
- Authenticates gh CLI with `GITHUB_PAT` if provided
- Installs build-essential, git, curl via apt

**Inputs:** `NODE_INSTALL_METHOD`, `GITHUB_PAT`
**Outputs:** Node.js 22.x, pnpm, gh CLI, build tools; checkpoint `30-environment-setup`
**Idempotent:** Yes — package managers skip already-installed packages

#### Phase 40 — OpenClaw Source Install

**Purpose:** Clones the OpenClaw repository and builds from source.

**What it does:**

- Clones `https://github.com/{GITHUB_REPO}.git` to `OPENCLAW_ROOT`
- Checks out `GITHUB_BRANCH`
- Runs `pnpm install --frozen-lockfile` + `pnpm build`
- Verifies `dist/entry.js` (or `dist/entry.mjs`) exists
- In update mode (`--update`): pulls latest and rebuilds instead of cloning
- If already cloned without `--update`: skips if build exists, rebuilds if missing

**Inputs:** `GITHUB_REPO`, `GITHUB_BRANCH`, `OPENCLAW_ROOT`, `UPDATE_MODE`
**Outputs:** Built OpenClaw at `OPENCLAW_ROOT`, `NODE_BIN_PATH`; checkpoint `40-openclaw-install`
**Idempotent:** Yes — skips clone if `.git` exists, verifies build before skipping

#### Phase 45 — Alias Setup

**Purpose:** Creates the `openclaw` CLI wrapper for the agent user.

**What it does:**

- Renders the wrapper script from `templates/openclaw-wrapper.sh.template`
- Deploys to `~/.local/bin/openclaw` with execute permissions
- Ensures `~/.local/bin` is in PATH by appending to `.bashrc`/`.zshrc`
- Verifies the wrapper is executable

**Inputs:** `OPENCLAW_ROOT`, `OPENCLAW_WRAPPER` path
**Outputs:** Executable wrapper at `~/.local/bin/openclaw`; checkpoint `45-alias-setup`
**Idempotent:** Yes — checks PATH entry before appending

The wrapper delegates to `scripts/run-node.mjs` which auto-rebuilds TypeScript
when source files change:

```bash
#!/usr/bin/env bash
OPENCLAW_ROOT="/home/agent/openclaw"
cd "${OPENCLAW_ROOT}" && exec node scripts/run-node.mjs "$@"
```

#### Phase 50 — Configuration Generation

**Purpose:** Renders configuration templates with environment variable values.

**What it does:**

- Renders `openclaw.json.template` → `~/.openclaw/openclaw.json` (mode 600)
- Renders `systemd-user.service.template` → `~/.config/systemd/user/openclaw-gateway.service`
- Renders `SOUL.md.template` → `~/.openclaw/workspace/SOUL.md`
- Validates rendered JSON with `jq` if available
- Validates no unresolved `{{PLACEHOLDER}}` patterns remain
- Sets correct ownership and permissions

**Inputs:** All agent/channel/security/system variables
**Outputs:** `openclaw.json`, systemd service file, `SOUL.md`; checkpoint `50-config-generation`
**Idempotent:** Yes — overwrites existing files with latest config

#### Phase 60 — Service Setup

**Purpose:** Starts the OpenClaw gateway as a persistent systemd user service.

**What it does:**

- Reloads the systemd user daemon (`daemon-reload`)
- Enables the `openclaw-gateway.service` for auto-start on boot
- Starts the service
- Waits 5 seconds for stabilization
- Checks service status; on failure, dumps last 50 journal lines

**Inputs:** Systemd service file from Phase 50
**Outputs:** Running `openclaw-gateway` service; checkpoint `60-service-setup`
**Idempotent:** Yes — `enable` and `start` are idempotent systemd operations

#### Phase 70 — Verification

**Purpose:** Final validation of the deployed instance.

**What it does:**

- Tests the `openclaw --version` wrapper command
- Checks `openclaw.json` file permissions (expects 600)
- Probes the gateway health endpoint at `http://127.0.0.1:{GATEWAY_PORT}/health`
- Lists enabled channels
- Prints a deployment summary with next steps (SSH tunnel, WhatsApp pairing, etc.)
- Clears the checkpoint file on success

**Inputs:** Running service from Phase 60
**Outputs:** Verification report, cleared checkpoint; checkpoint `70-verification`
**Idempotent:** Yes — read-only checks

#### Phase 95 — Decommission

**Purpose:** Non-destructive shutdown of an agent deployment.

Triggered via `--decommission` flag. Runs **only this phase** (skips 00–70).

**What it does:**

1. Stops and disables the `openclaw-gateway` systemd service
2. Removes `node_modules/` and `dist/` to free disk space
3. Opens home directory permissions to 755 (allows other VPS users to browse)
4. Opens source directory permissions recursively
5. Preserves credentials (700) and `openclaw.json` (600)
6. Writes `.decommissioned` marker with timestamp
7. Prints reactivation instructions

**Preserved:** Config, workspace, credentials, source code, wrapper, service file.
**Removed:** `node_modules/`, `dist/` (bulk of disk usage).

**Reactivation:**

```bash
cd ~/openclaw
pnpm install && pnpm build
systemctl --user enable openclaw-gateway.service
systemctl --user start openclaw-gateway.service
rm -f .decommissioned
```

#### Phase 99 — Rollback

**Purpose:** Cascading cleanup on deployment failure.

Automatically triggered when any phase fails, or run manually via
`bash setup/phases/99-rollback.sh`.

**What it does (cascading from last checkpoint):**

- Stops and disables systemd service
- Removes configuration files (`openclaw.json`, `SOUL.md`, service file)
- Removes the `openclaw` wrapper and PATH entries
- Removes the source directory (`OPENCLAW_ROOT`)
- Removes gh authentication
- Remote mode: removes the agent user account entirely

**Inputs:** Checkpoint file at `/tmp/openclaw-setup/checkpoint.txt`
**Outputs:** Clean state as if deployment never happened

---

## Customization

### Profiles

Profiles are YAML files that pre-configure deployment variables. They define the
agent's identity, channels, security posture, and system resources.

All agent profiles are maintained in the
[minions](https://github.com/NikolasP98/minions) repository for portability and
independent versioning. See [External Agent Profiles (Minions)](#external-agent-profiles-minions)
for details.

#### Using Profiles

Reference a profile by full path:

```bash
./setup/setup.sh --profile=~/minions/profiles/customer-support.yaml --api-key=sk-ant-xxx
```

Or copy into `setup/profiles/` for shorthand:

```bash
cp ~/minions/profiles/customer-support.yaml setup/profiles/customer-support.profile.yaml
./setup/setup.sh --profile=customer-support --api-key=sk-ant-xxx
```

#### Creating Custom Profiles

Copy an existing profile from minions and edit:

```bash
cp ~/minions/profiles/personal-assistant.yaml setup/profiles/my-agent.profile.yaml
```

Profile YAML sections:

- `profile` — metadata (name, description, version)
- `agent` — `AGENT_NAME`, `AGENT_PERSONALITY`, `COMMUNICATION_STYLE`, etc.
- `channels` — `ENABLE_WHATSAPP`, `ENABLE_TELEGRAM`, `ENABLE_DISCORD`, `ENABLE_WEB`
- `security` — `SANDBOX_MODE`, `DM_POLICY`
- `system` — `NODE_INSTALL_METHOD`, `MEMORY_LIMIT`, `CPU_QUOTA`
- `features` — `auto_backup`, `monitoring`, `log_retention_days`

### Templates

Templates use `{{VARIABLE}}` placeholders that are replaced with environment
variable values at render time.

| Template                        | Output                                            | Purpose                      |
| ------------------------------- | ------------------------------------------------- | ---------------------------- |
| `openclaw.json.template`        | `~/.openclaw/openclaw.json`                       | Gateway runtime config       |
| `systemd-user.service.template` | `~/.config/systemd/user/openclaw-gateway.service` | Service definition           |
| `SOUL.md.template`              | `~/.openclaw/workspace/SOUL.md`                   | Agent personality/guidelines |
| `openclaw-wrapper.sh.template`  | `~/.local/bin/openclaw`                           | CLI wrapper script           |

### Variable Tiers

Variables are organized in 4 tiers with cascading resolution:

| Tier               | Description                          | Examples                                               |
| ------------------ | ------------------------------------ | ------------------------------------------------------ |
| **Required**       | Must be provided                     | `ANTHROPIC_API_KEY`, `VPS_HOSTNAME` (remote)           |
| **Inferable**      | Derived from profile or conversation | `AGENT_NAME`, `SANDBOX_MODE`, `DM_POLICY`              |
| **System-derived** | Auto-generated from inputs           | `GATEWAY_PORT`, `AGENT_USERNAME`, `GATEWAY_AUTH_TOKEN` |
| **Flexible**       | Accept multiple formats              | `NODE_INSTALL_METHOD`, `EXEC_MODE`, `GITHUB_BRANCH`    |

### Variable Precedence

Resolution order (first match wins):

1. **Command-line flag** — `--agent-name=foo`
2. **Profile file** — loaded via `--profile=`
3. **defaults.yaml** — `setup/config/defaults.yaml`
4. **Hardcoded fallback** — `derive_system_variables()` in `lib/variables.sh`

---

## External Agent Profiles (Minions)

All agent profiles are maintained in the [minions](https://github.com/NikolasP98/minions)
repository for portability and independent versioning.

### Why Separate?

- **Separation of concerns** — profiles evolve independently of the setup framework
- **Independent update cycle** — update profiles without touching the orchestrator
- **Portability** — share profiles across machines, teams, or forks

### Available Profiles

| Profile                 | Role         | Channels       | Security                  | Use Case                        |
| ----------------------- | ------------ | -------------- | ------------------------- | ------------------------------- |
| `main-orchestrator`     | orchestrator | WhatsApp + Web | sandbox=off, pairing      | Multi-agent task routing        |
| `customer-support`      | specialist   | WhatsApp + Web | sandbox=all, pairing      | Restaurant customer ops         |
| `appointment-scheduler` | specialist   | (delegated)    | sandbox=all, pairing      | Booking & calendar management   |
| `data-analyst`          | specialist   | (delegated)    | sandbox=all, pairing      | Reports & business intelligence |
| `content-creator`       | specialist   | (delegated)    | sandbox=all, pairing      | Social media & marketing        |
| `personal-assistant`    | standalone   | Telegram + Web | sandbox=non-main, pairing | Personal productivity           |

### Usage

```bash
# Clone the minions repo once
git clone https://github.com/NikolasP98/minions.git ~/minions

# Reference by full path
./setup/setup.sh --profile=~/minions/profiles/customer-support.yaml \
  --api-key=sk-ant-xxx --vps-hostname=server.example.com

# Or copy into setup/profiles/ for shorthand
cp ~/minions/profiles/customer-support.yaml setup/profiles/customer-support.profile.yaml
./setup/setup.sh --profile=customer-support --api-key=sk-ant-xxx
```

A full multi-agent gateway configuration example is available at
[`minions/examples/openclaw.json.example`](https://github.com/NikolasP98/minions/blob/main/examples/openclaw.json.example).

### Profile Schema

See [`minions/docs/profile-structure.md`](https://github.com/NikolasP98/minions/blob/main/docs/profile-structure.md)
for the full YAML schema and annotated example.

---

## Architecture

### Dual-Mode Execution

All phase scripts use `run_cmd` from `lib/network.sh`:

- **Local mode:** `bash -c "$command"` — direct execution
- **Remote mode:** `ssh user@hostname "$command"` — SSH delegation

File transfers use `copy_file()`:

- **Local mode:** `cp source destination`
- **Remote mode:** `scp source user@hostname:destination`

The `--as USER` flag controls which user executes the command (relevant in
remote mode where root and agent user are different).

### Idempotent Phases

Every phase is safe to re-run:

- User creation checks if user exists before creating
- Package installs skip already-installed packages
- Directory creation uses `mkdir -p`
- Config generation overwrites with latest values
- Service enable/start are idempotent systemd operations

### Checkpoint / Resume

Each phase saves a checkpoint to `/tmp/openclaw-setup/checkpoint.txt` on success.
Resume from a specific phase after fixing an issue:

```bash
./setup/setup.sh --start-from=40 --api-key=sk-ant-xxx
```

Skip specific phases:

```bash
./setup/setup.sh --skip-phase=30 --api-key=sk-ant-xxx
```

### Cascading Rollback

On phase failure, the orchestrator calls `phases/99-rollback.sh` which reads the
last checkpoint and rolls back from that point in reverse order using bash
case fall-through (`;;&`).

### Template Engine

`lib/templates.sh` provides `{{VARIABLE}}` placeholder rendering:

1. Scans template for `{{UPPER_CASE}}` patterns
2. Replaces each with the corresponding environment variable value
3. Warns on unset variables (leaves placeholder intact)
4. Post-render validation checks for unresolved placeholders

### Logging System

`lib/logging.sh` provides dual-output logging:

- **Console:** Color-coded by level (cyan=DEBUG, blue=INFO, yellow=WARN, red=ERROR, green=SUCCESS)
- **File:** Timestamped plain text at `/tmp/openclaw-setup/setup-YYYYMMDD-HHMMSS.log`
- **Levels:** DEBUG (0), INFO (1), WARN (2), ERROR (3) — set via `--verbose` or `VERBOSE=true`
- **Phase markers:** Box-drawing characters for phase start/end
- **Error handling:** `handle_error()` prints error box with phase, message, and log file path

All log output goes to stderr to avoid polluting stdout (which may be captured
in command substitutions like `$(run_cmd ...)`).

---

## Library Reference

### `lib/logging.sh`

| Function           | Signature                     | Description                                        |
| ------------------ | ----------------------------- | -------------------------------------------------- |
| `log_debug`        | `log_debug MESSAGE`           | Debug-level log (cyan, only with `--verbose`)      |
| `log_info`         | `log_info MESSAGE`            | Info-level log (blue)                              |
| `log_warn`         | `log_warn MESSAGE`            | Warning-level log (yellow)                         |
| `log_error`        | `log_error MESSAGE`           | Error-level log (red)                              |
| `log_success`      | `log_success MESSAGE`         | Success-level log (green)                          |
| `phase_start`      | `phase_start NAME NUM`        | Print phase header box                             |
| `phase_end`        | `phase_end NAME [STATUS]`     | Print phase completion (success/failure)           |
| `save_checkpoint`  | `save_checkpoint PHASE`       | Write phase name to checkpoint file                |
| `load_checkpoint`  | `load_checkpoint`             | Read last checkpoint (stdout)                      |
| `clear_checkpoint` | `clear_checkpoint`            | Delete checkpoint file                             |
| `handle_error`     | `handle_error CODE MSG PHASE` | Log error, save failed checkpoint, print error box |
| `show_progress`    | `show_progress MSG [SECS]`    | Animated progress dots                             |

**Environment variables:**

- `LOG_DIR` — log directory (default: `/tmp/openclaw-setup`)
- `LOG_FILE` — log file path (default: `$LOG_DIR/setup-TIMESTAMP.log`)
- `VERBOSE` — set to `true` for debug-level output
- `CURRENT_LOG_LEVEL` — numeric level (0=DEBUG, 1=INFO, 2=WARN, 3=ERROR)

### `lib/variables.sh`

| Function                      | Signature                     | Description                                |
| ----------------------------- | ----------------------------- | ------------------------------------------ |
| `validate_required_variables` | `validate_required_variables` | Check required vars are set (mode-aware)   |
| `derive_system_variables`     | `derive_system_variables`     | Populate system-derived vars from inputs   |
| `validate_api_key`            | `validate_api_key KEY TYPE`   | Validate key format (anthropic, github)    |
| `validate_username`           | `validate_username NAME`      | Validate username (lowercase, 32 char max) |
| `load_profile`                | `load_profile FILE`           | Load YAML profile (yq or grep fallback)    |
| `display_config`              | `display_config`              | Print masked configuration summary         |

**Key derivations in `derive_system_variables`:**

- `AGENT_USERNAME` ← `openclaw-{AGENT_NAME}` (lowercased, spaces→hyphens)
- `GATEWAY_PORT` ← `18789` (default)
- `GATEWAY_AUTH_TOKEN` ← `uuidgen` or `/proc/sys/kernel/random/uuid`
- `AGENT_HOME_DIR` ← `$HOME` (local) or `/home/{AGENT_USERNAME}` (remote)
- `OPENCLAW_ROOT` ← `{AGENT_HOME_DIR}/openclaw`
- `OPENCLAW_WRAPPER` ← `{AGENT_HOME_DIR}/.local/bin/openclaw`

### `lib/network.sh`

| Function               | Signature                                         | Description                             |
| ---------------------- | ------------------------------------------------- | --------------------------------------- |
| `run_cmd`              | `run_cmd [--as USER] COMMAND`                     | Execute command in local or remote mode |
| `copy_file`            | `copy_file SRC DST [USER]`                        | Copy file locally or via SCP            |
| `test_ssh_connection`  | `test_ssh_connection HOST [USER] [TIMEOUT]`       | Test SSH connectivity                   |
| `remote_exec`          | `remote_exec HOST USER CMD`                       | Execute via SSH                         |
| `remote_copy`          | `remote_copy SRC HOST USER DST`                   | Copy via SCP                            |
| `test_tailscale`       | `test_tailscale HOST`                             | Ping test for Tailscale connectivity    |
| `wait_for_service`     | `wait_for_service HOST PORT [TIMEOUT] [INTERVAL]` | Wait for TCP service                    |
| `check_port_available` | `check_port_available PORT`                       | Check if port is free                   |

### `lib/templates.sh`

| Function                    | Signature                                  | Description                                 |
| --------------------------- | ------------------------------------------ | ------------------------------------------- |
| `render_template`           | `render_template TEMPLATE OUTPUT`          | Replace `{{VAR}}` with env var values       |
| `validate_template`         | `validate_template FILE`                   | Check for unresolved `{{VAR}}` placeholders |
| `render_templates_from_dir` | `render_templates_from_dir DIR OUTPUT_DIR` | Batch-render all `.template` files          |

### `lib/openclaw-env.sh`

Environment derivation for multi-tenant deployments. Source this after setting
pre-source defaults.

**Derived variables:**

- `OPENCLAW_ENV` — environment name (default: `prd`, forced lowercase, validated)
- `OPENCLAW_TENANT` — tenant identifier (optional, forced lowercase, validated)
- `OPENCLAW_CONFIG_DIR` — `~/.openclaw-{env}` or `~/.openclaw-{env}-{tenant}`
- `OPENCLAW_WORKSPACE_DIR` — `{config_dir}/workspace`

---

## Utilities

| Script                    | Purpose                                   | Usage                                          |
| ------------------------- | ----------------------------------------- | ---------------------------------------------- |
| `add-tenant.sh`           | Interactive helper for multi-tenant setup | `bash setup/utilities/add-tenant.sh`           |
| `backup-openclaw.sh`      | Config backup with retention policy       | `bash setup/utilities/backup-openclaw.sh`      |
| `generate-deploy-keys.sh` | SSH key generation for CI/CD              | `bash setup/utilities/generate-deploy-keys.sh` |

---

## Configuration Files

### `config/defaults.yaml`

All default values for the setup framework. Organized by section:

| Section     | Key defaults                                                   |
| ----------- | -------------------------------------------------------------- |
| `install`   | method=source, repo=NikolasP98/openclaw, branch=main           |
| `gateway`   | mode=local, bind=127.0.0.1, port_start=18789                   |
| `security`  | sandbox_mode=non-main, dm_policy=pairing                       |
| `channels`  | web=enabled, whatsapp/telegram/discord=disabled                |
| `system`    | node_install_method=apt, node_version=22, pnpm_version=10.23.0 |
| `resources` | memory_limit=2G, cpu_quota=100%                                |
| `agent`     | model=claude-sonnet-4-5-20250929, temperature=0.7              |

### `config/schema.sql`

SQLite schema for tracking deployments, agents, and health checks. Tables:

- `profiles` — reusable configuration templates
- `agents` — deployed agent instances with status tracking
- `deployments` — deployment history with checkpoints and logs
- `port_allocations` — port usage tracking for multi-agent
- `health_checks` — historical health check results
- `channels` — configured channels per agent
- `backups` — backup operation history
- `audit_log` — all configuration changes

> **Note:** The schema exists but is not yet wired up. See `IMPROVEMENTS.md` for
> the SQLite integration proposal.

---

## Directory Layout

```
setup/
├── setup.sh                        # Entry-point orchestrator
├── README.md                       # This file
├── IMPROVEMENTS.md                 # Proposals tracker
├── lib/
│   ├── logging.sh                  # 5-level color-coded dual logging
│   ├── variables.sh                # 4-tier variable classification & validation
│   ├── network.sh                  # run_cmd/copy_file dual-mode abstraction
│   ├── templates.sh                # {{VAR}} template rendering
│   └── openclaw-env.sh             # Environment/tenant derivation
├── phases/
│   ├── 00-preflight.sh             # Validate variables, test connectivity
│   ├── 20-user-creation.sh         # Create user/dirs, enable lingering
│   ├── 30-environment-setup.sh     # Install Node.js, pnpm, gh CLI
│   ├── 40-openclaw-install.sh      # git clone + pnpm install + pnpm build
│   ├── 45-alias-setup.sh           # Create openclaw wrapper, update PATH
│   ├── 50-config-generation.sh     # Render templates → config files
│   ├── 60-service-setup.sh         # Enable and start systemd service
│   ├── 70-verification.sh          # Health checks, deployment summary
│   ├── 95-decommission.sh          # Non-destructive shutdown (--decommission)
│   └── 99-rollback.sh              # Cascading cleanup on failure
├── templates/
│   ├── openclaw.json.template      # Gateway runtime configuration
│   ├── systemd-user.service.template  # systemd unit file
│   ├── SOUL.md.template            # Agent personality/guidelines
│   └── openclaw-wrapper.sh.template   # CLI wrapper script
├── profiles/                       # Local copies (optional, see minions repo)
├── utilities/
│   ├── add-tenant.sh               # Multi-tenant setup helper
│   ├── backup-openclaw.sh          # Config backup with retention
│   └── generate-deploy-keys.sh     # SSH key generation for CI/CD
└── config/
    ├── defaults.yaml               # All default values
    └── schema.sql                  # SQLite schema (future use)
```

---

## Flags Reference

### Modes

| Flag             | Type    | Default     | Description                               |
| ---------------- | ------- | ----------- | ----------------------------------------- |
| `--mode=MODE`    | string  | auto-detect | `local` or `remote`                       |
| `--decommission` | boolean | false       | Stop services, free disk, preserve config |

### Source Install

| Flag                 | Type    | Default               | Description                    |
| -------------------- | ------- | --------------------- | ------------------------------ |
| `--install-dir=PATH` | path    | `~/openclaw`          | Where to clone the repo        |
| `--repo=REPO`        | string  | `NikolasP98/openclaw` | GitHub repository              |
| `--branch=BRANCH`    | string  | `main`                | Git branch to checkout         |
| `--update`           | boolean | false                 | Pull latest source and rebuild |

### Configuration

| Flag                    | Type        | Default     | Description                                    |
| ----------------------- | ----------- | ----------- | ---------------------------------------------- |
| `--profile=PROFILE`     | string/path | —           | Built-in name or path to profile YAML          |
| `--vps-hostname=HOST`   | string      | —           | VPS hostname/IP (implies remote mode)          |
| `--api-key=KEY`         | string      | —           | Anthropic API key (**required**)               |
| `--tailscale-key=KEY`   | string      | —           | Tailscale auth key                             |
| `--github-pat=TOKEN`    | string      | —           | GitHub Personal Access Token                   |
| `--gateway-port=PORT`   | number      | `18789`     | Gateway listen port                            |
| `--gateway-bind=MODE`   | string      | `loopback`  | Bind mode: loopback, lan, tailnet              |
| `--gateway-token=TOKEN` | string      | (generated) | Gateway auth token (auto-generated if omitted) |

### Agent

| Flag                       | Type   | Default         | Description                                    |
| -------------------------- | ------ | --------------- | ---------------------------------------------- |
| `--agent-name=NAME`        | string | `openclaw`      | Agent name (used in username, service, config) |
| `--agent-personality=DESC` | string | profile/default | Agent personality description                  |
| `--sandbox-mode=MODE`      | string | `non-main`      | `off`, `non-main`, `all`                       |
| `--dm-policy=POLICY`       | string | `pairing`       | `open`, `pairing`                              |
| `--tenant=NAME`            | string | —               | Tenant identifier (multi-tenant)               |

### Channels

| Flag                     | Type    | Default | Description             |
| ------------------------ | ------- | ------- | ----------------------- |
| `--enable-whatsapp`      | boolean | false   | Enable WhatsApp channel |
| `--enable-telegram`      | boolean | false   | Enable Telegram channel |
| `--enable-discord`       | boolean | false   | Enable Discord channel  |
| `--whatsapp-phone=PHONE` | string  | —       | WhatsApp phone number   |
| `--telegram-token=TOKEN` | string  | —       | Telegram bot token      |
| `--discord-token=TOKEN`  | string  | —       | Discord bot token       |

### System

| Flag                   | Type   | Default | Description          |
| ---------------------- | ------ | ------- | -------------------- |
| `--node-method=METHOD` | string | `apt`   | `apt`, `nvm`, `skip` |

### Execution

| Flag                 | Type    | Default | Description                              |
| -------------------- | ------- | ------- | ---------------------------------------- |
| `--dry-run`          | boolean | false   | Show what would happen without executing |
| `--skip-phase=PHASE` | string  | —       | Skip a phase (repeatable)                |
| `--start-from=PHASE` | string  | —       | Resume from phase number                 |
| `--force-reinstall`  | boolean | false   | Force rebuild even if present            |
| `-v`, `--verbose`    | boolean | false   | Debug-level logging                      |
| `--help`             | —       | —       | Show usage information                   |

---

## Examples

### 1. Basic Local Deployment

Deploy directly on the VPS with minimal flags:

```bash
./setup/setup.sh --api-key=sk-ant-api03-xxxxxxxxxxxx --agent-name=mybot
```

### 2. Remote Deployment via SSH

Orchestrate from your local machine:

```bash
./setup/setup.sh \
  --vps-hostname=vps.example.com \
  --api-key=sk-ant-api03-xxxxxxxxxxxx \
  --github-pat=ghp_xxxxxxxxxxxx \
  --agent-name=support-bot
```

### 3. Deployment with Profile

Use a built-in profile for pre-configured settings:

```bash
./setup/setup.sh \
  --profile=customer-support \
  --api-key=sk-ant-api03-xxxxxxxxxxxx \
  --whatsapp-phone=+15551234567 \
  --vps-hostname=vps.example.com
```

### 4. External Profile from Minions

Reference a profile from the minions repo:

```bash
git clone https://github.com/NikolasP98/minions.git ~/minions

./setup/setup.sh \
  --profile=~/minions/profiles/personal-assistant.yaml \
  --api-key=sk-ant-api03-xxxxxxxxxxxx \
  --telegram-token=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
```

### 5. Multi-Tenant Deployment

Deploy multiple agents on the same VPS:

```bash
# First agent
./setup/setup.sh \
  --api-key=sk-ant-api03-xxxxxxxxxxxx \
  --agent-name=restaurant-a \
  --tenant=restaurant-a \
  --profile=customer-support

# Second agent (gets a different user, port, and config directory)
./setup/setup.sh \
  --api-key=sk-ant-api03-yyyyyyyyyyyy \
  --agent-name=restaurant-b \
  --tenant=restaurant-b \
  --profile=customer-support
```

### 6. Update Existing Install

Pull latest source and rebuild:

```bash
./setup/setup.sh --update --verbose
```

Remote update:

```bash
./setup/setup.sh --update --vps-hostname=vps.example.com --agent-name=mybot
```

### 7. Decommission an Agent

Stop services and free disk without destroying config:

```bash
./setup/setup.sh --decommission --agent-name=mybot
```

Remote decommission:

```bash
./setup/setup.sh --decommission --vps-hostname=vps.example.com --agent-name=mybot
```

### 8. Resume After Failure

If Phase 40 failed, fix the issue and resume:

```bash
./setup/setup.sh --start-from=40 --api-key=sk-ant-api03-xxxxxxxxxxxx
```

### 9. Dry Run

Preview what would happen without making changes:

```bash
./setup/setup.sh \
  --dry-run \
  --api-key=sk-ant-api03-xxxxxxxxxxxx \
  --agent-name=testbot \
  --enable-telegram \
  --verbose
```

### 10. Custom Install Directory and Branch

Deploy from a specific branch to a custom location:

```bash
./setup/setup.sh \
  --api-key=sk-ant-api03-xxxxxxxxxxxx \
  --agent-name=dev-bot \
  --install-dir=/opt/openclaw-dev \
  --branch=DEV \
  --node-method=nvm
```

---

## Troubleshooting

### Service Won't Start

Check the journal for errors:

```bash
journalctl --user -u openclaw-gateway -n 50
systemctl --user status openclaw-gateway
```

Common causes:

- Missing `dist/entry.js` — rebuild with `cd ~/openclaw && pnpm install && pnpm build`
- Port already in use — check with `ss -tuln | grep 18789`
- Missing API key in `openclaw.json` — verify `~/.openclaw/openclaw.json`

### Build Fails

```bash
cd ~/openclaw
pnpm install --frozen-lockfile
pnpm build
```

If `pnpm` is not found, re-run Phase 30:

```bash
bash setup/phases/30-environment-setup.sh
```

Ensure Node.js 22+ is installed:

```bash
node --version  # Should be v22.x
```

### Wrapper Not Found

Ensure `~/.local/bin` is in PATH:

```bash
echo $PATH | tr ':' '\n' | grep local
```

If missing, add it:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

Or re-run Phase 45:

```bash
bash setup/phases/45-alias-setup.sh
```

### SSH Connection Fails (Remote Mode)

```bash
# Test SSH manually
ssh root@vps.example.com "echo ok"

# Check SSH key is loaded
ssh-add -l

# Verify hostname resolves
host vps.example.com
```

Ensure the target VPS allows root SSH (needed for user creation in Phase 20).

### Rollback Needed

Manually trigger a full rollback:

```bash
bash setup/phases/99-rollback.sh
```

Or rollback and redeploy:

```bash
bash setup/phases/99-rollback.sh
./setup/setup.sh --api-key=sk-ant-xxx --agent-name=mybot
```

### Reactivating a Decommissioned Agent

If the agent was decommissioned via `--decommission`:

```bash
cd ~/openclaw
pnpm install
pnpm build
systemctl --user enable openclaw-gateway.service
systemctl --user start openclaw-gateway.service
rm -f .decommissioned

# Optionally restore home directory permissions
sudo chmod 750 /home/openclaw-mybot
```

### Port Conflicts

If port 18789 is already in use:

```bash
# Find what's using the port
ss -tuln | grep 18789

# Kill the existing process if needed
# Then restart
systemctl --user restart openclaw-gateway
```

For multi-agent setups, each agent should use a different port. Configure via
the `GATEWAY_PORT` environment variable or the systemd service file.

### Template Rendering Errors

If configuration generation fails with unresolved placeholders:

```bash
# Check which variables are missing
grep -o '{{[A-Z_]*}}' ~/.openclaw/openclaw.json

# Re-run config generation with verbose logging
bash setup/phases/50-config-generation.sh
```
