# OpenClaw Setup Framework

VPS user-level deployment via `git clone` + `pnpm install` + `pnpm build`.

## Quick Start

```bash
# Local mode (run directly on the VPS)
./setup/setup.sh --api-key=sk-ant-xxx --agent-name=mybot

# Remote mode (from your local machine → VPS via SSH)
./setup/setup.sh --vps-hostname=server.example.com \
  --api-key=sk-ant-xxx --github-pat=ghp_xxx --agent-name=mybot

# Using a profile
./setup/setup.sh --profile=customer-support --api-key=sk-ant-xxx

# Update existing install
./setup/setup.sh --update

# Dry run (show what would happen)
./setup/setup.sh --dry-run --api-key=sk-ant-test --verbose
```

## Execution Modes

| Mode       | Flag                                     | When to use                                   |
| ---------- | ---------------------------------------- | --------------------------------------------- |
| **local**  | `--mode=local` (default)                 | Running directly on the VPS                   |
| **remote** | `--mode=remote` or `--vps-hostname=HOST` | Orchestrating from your local machine via SSH |

Mode auto-detects: if `--vps-hostname` is provided, defaults to remote.

## Phases

| Phase | Script              | What it does                                                          |
| ----- | ------------------- | --------------------------------------------------------------------- |
| 00    | `preflight`         | Validates variables, checks connectivity, verifies git/node           |
| 20    | `user-creation`     | Creates agent user (remote) or directories (local), enables lingering |
| 30    | `environment-setup` | Installs Node.js, pnpm (corepack), gh CLI, build tools                |
| 40    | `openclaw-install`  | `git clone` + `pnpm install` + `pnpm build`                           |
| 45    | `alias-setup`       | Creates `~/.local/bin/openclaw` wrapper, updates PATH                 |
| 50    | `config-generation` | Renders templates → `openclaw.json`, systemd service, `SOUL.md`       |
| 60    | `service-setup`     | Enables and starts systemd user service                               |
| 70    | `verification`      | Health checks, prints deployment summary                              |
| 99    | `rollback`          | Cascading cleanup on failure                                          |

Resume from any phase: `--start-from=40` or skip phases: `--skip-phase=30`.

## Directory Layout

```
setup/
├── setup.sh                    # Entry-point orchestrator
├── README.md                   # This file
├── lib/
│   ├── logging.sh              # 5-level color-coded dual logging
│   ├── variables.sh            # 4-tier variable classification
│   ├── network.sh              # run_cmd/copy_file dual-mode abstraction
│   ├── templates.sh            # {{VAR}} template rendering
│   └── openclaw-env.sh         # Environment/tenant derivation
├── phases/
│   ├── 00-preflight.sh
│   ├── 20-user-creation.sh
│   ├── 30-environment-setup.sh
│   ├── 40-openclaw-install.sh
│   ├── 45-alias-setup.sh
│   ├── 50-config-generation.sh
│   ├── 60-service-setup.sh
│   ├── 70-verification.sh
│   └── 99-rollback.sh
├── templates/
│   ├── openclaw.json.template
│   ├── systemd-user.service.template
│   ├── SOUL.md.template
│   └── openclaw-wrapper.sh.template
├── profiles/
│   ├── customer-support.profile.yaml
│   └── personal-assistant.profile.yaml
├── utilities/
│   ├── add-tenant.sh
│   ├── backup-openclaw.sh
│   └── generate-deploy-keys.sh
└── config/
    ├── defaults.yaml
    └── schema.sql
```

## Flags Reference

### Required

| Flag            | Description                  |
| --------------- | ---------------------------- |
| `--api-key=KEY` | Anthropic API key (required) |

### Source Install

| Flag                 | Default               | Description             |
| -------------------- | --------------------- | ----------------------- |
| `--install-dir=PATH` | `~/openclaw`          | Where to clone the repo |
| `--repo=REPO`        | `NikolasP98/openclaw` | GitHub repository       |
| `--branch=BRANCH`    | `main`                | Git branch to checkout  |
| `--update`           | -                     | Pull latest and rebuild |

### Configuration

| Flag                  | Default    | Description                        |
| --------------------- | ---------- | ---------------------------------- |
| `--profile=PROFILE`   | -          | Load from profile file             |
| `--vps-hostname=HOST` | -          | VPS hostname (implies remote mode) |
| `--agent-name=NAME`   | `openclaw` | Agent name                         |
| `--sandbox-mode=MODE` | `non-main` | off, non-main, all                 |
| `--dm-policy=POLICY`  | `pairing`  | open, pairing                      |
| `--tenant=NAME`       | -          | Tenant identifier                  |

### Channels

| Flag                | Default | Description     |
| ------------------- | ------- | --------------- |
| `--enable-whatsapp` | false   | Enable WhatsApp |
| `--enable-telegram` | false   | Enable Telegram |
| `--enable-discord`  | false   | Enable Discord  |

### Execution

| Flag                 | Description               |
| -------------------- | ------------------------- |
| `--dry-run`          | Show what would happen    |
| `--skip-phase=PHASE` | Skip a phase (repeatable) |
| `--start-from=PHASE` | Resume from phase number  |
| `--force-reinstall`  | Force rebuild             |
| `-v, --verbose`      | Debug-level logging       |

## Profiles

Profiles are YAML files that pre-configure variables:

- **customer-support**: WhatsApp-focused, sandbox=all, restaurant operations
- **personal-assistant**: Telegram-focused, sandbox=non-main, personal productivity

Create custom profiles in `setup/profiles/my-agent.profile.yaml`.

## How it Works

### The `openclaw` Command

After setup, the `openclaw` command is available system-wide via a wrapper at `~/.local/bin/openclaw`:

```bash
#!/usr/bin/env bash
OPENCLAW_ROOT="${HOME}/openclaw"
cd "${OPENCLAW_ROOT}" && exec node scripts/run-node.mjs "$@"
```

This uses `run-node.mjs` which auto-rebuilds TypeScript when source files change.

### systemd User Service

The gateway runs as a systemd user service:

```
ExecStart=/usr/bin/node ~/openclaw/scripts/run-node.mjs gateway --port 18789
WorkingDirectory=~/openclaw
```

Manage with:

```bash
systemctl --user status openclaw-gateway
systemctl --user restart openclaw-gateway
journalctl --user -u openclaw-gateway -f
```

### Dual-Mode Execution

All phase scripts use `run_cmd` from `lib/network.sh`:

- **Local mode**: executes commands directly via `bash -c`
- **Remote mode**: executes via SSH to `VPS_HOSTNAME`

### Variable Classification

Variables are organized in 4 tiers:

1. **Required**: Must be provided (e.g., `ANTHROPIC_API_KEY`)
2. **Inferable**: Can be derived from profile or conversation
3. **System-derived**: Auto-generated (ports, paths, tokens)
4. **Flexible**: Accept multiple formats (install method, service manager)

## Utilities

| Script                    | Purpose                                   |
| ------------------------- | ----------------------------------------- |
| `add-tenant.sh`           | Interactive helper for multi-tenant setup |
| `backup-openclaw.sh`      | Config backup with retention policy       |
| `generate-deploy-keys.sh` | SSH key generation for CI/CD              |

## Troubleshooting

**Service won't start**: Check logs with `journalctl --user -u openclaw-gateway -n 50`

**Build fails**: Ensure Node.js 22+ and pnpm are installed. Try `cd ~/openclaw && pnpm install && pnpm build`.

**Wrapper not found**: Ensure `~/.local/bin` is in PATH. Run `source ~/.bashrc` or log out/in.

**Rollback**: Run `bash setup/phases/99-rollback.sh` to clean up a failed deployment.

**Resume**: Use `--start-from=PHASE_NUMBER` to resume from a specific phase after fixing the issue.
