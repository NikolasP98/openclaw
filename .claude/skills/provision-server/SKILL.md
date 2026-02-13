---
skill: provision-server
description: >
  Provision a new OpenClaw instance on a remote server. Handles the full lifecycle:
  SSH connectivity check, dry run, credential collection, setup execution, monitoring,
  verification, and server config registration. Use when deploying a new agent instance,
  setting up a dev environment on a VPS, or provisioning a new tenant.
triggers:
  - provision server
  - deploy new instance
  - set up VPS
  - new agent deployment
  - provision remote
  - deploy openclaw
  - new server setup
  - add server
  - provision tenant
---

# Server Provisioning — Expert Workflow

End-to-end provisioning of OpenClaw instances on remote servers using the setup framework
at `setup/setup.sh`.

## Architecture Overview

### Setup Framework

- **Entry point**: `setup/setup.sh` — orchestrates all phases
- **Phases**: `setup/phases/` — 00 through 70 (plus 95-decommission, 99-rollback)
- **Libraries**: `setup/lib/` — logging, variables, network, templates
- **Templates**: `setup/templates/` — openclaw.json, systemd, SOUL.md, wrapper
- **Config**: `setup/config/defaults.yaml` — all default values
- **Profiles**: External `minions` repo or `setup/profiles/`

### Phase Sequence

| Phase | Name          | Purpose                                           |
| ----- | ------------- | ------------------------------------------------- |
| 00    | Preflight     | Validate environment, test SSH connectivity       |
| 20    | User Creation | Create agent user, directories, enable linger     |
| 30    | Environment   | Install/verify Node.js, pnpm, gh CLI, build tools |
| 40    | Install       | Clone repo, checkout branch, pnpm install + build |
| 45    | Alias         | Create `~/.local/bin/openclaw` wrapper            |
| 50    | Config        | Render templates, deploy with correct permissions |
| 60    | Service       | Enable + start systemd user service               |
| 70    | Verification  | Health checks, deployment summary                 |

### Server Config Files

- **Production**: `.github/servers/production.json`
- **Development**: `.github/servers/development.json`

Format:

```json
{
  "id": "env-tenant-name",
  "host": "hostname-or-ip",
  "user": "openclaw-username",
  "port": 22,
  "deployment_path": "/home/username/openclaw",
  "platform": "linux/amd64",
  "gateway_port": 18789,
  "bridge_port": 18790,
  "tenant": "tenant-name",
  "region": "us-east",
  "branch": "main",
  "local_build": true
}
```

## Provisioning Workflow

### Step 1: Verify Connectivity

Test SSH access to the target server before anything else:

```bash
ssh -o ConnectTimeout=5 -o BatchMode=yes root@<hostname> echo "SSH OK as root"
ssh -o ConnectTimeout=5 -o BatchMode=yes deploy@<hostname> echo "SSH OK as deploy"
```

Root access is required for user creation (phase 20) and package installation (phase 30).

### Step 2: Check for Port Conflicts

If the server already hosts other OpenClaw instances, verify port availability:

- Check `.github/servers/production.json` and `development.json` for existing port allocations
- Default gateway port: 18789, bridge: 18790
- Dev instances conventionally use offset ports (e.g., 28789/28790)

### Step 3: Dry Run

Always run a dry run first to verify configuration:

```bash
bash setup/setup.sh \
  --vps-hostname=<host> \
  --agent-name=<name> \
  --branch=<branch> \
  --gateway-port=<port> \
  --api-key=placeholder \
  --dry-run --verbose
```

Review the output to confirm:

- Correct `AGENT_USERNAME` derivation (openclaw-{agent-name})
- Correct `AGENT_HOME_DIR` path
- No variable conflicts with existing deployments

### Step 4: Collect Credentials

Prompt the user for required values:

| Credential        | Required                         | Notes                               |
| ----------------- | -------------------------------- | ----------------------------------- |
| Anthropic API key | Always                           | Starts with `sk-ant-`               |
| GitHub PAT        | If repo is private               | Starts with `ghp_` or `github_pat_` |
| Gateway port      | If server has existing instances | Must not conflict                   |

### Step 5: Execute Provisioning

Run the full provisioning in the background (it takes 5-10 minutes):

```bash
bash setup/setup.sh \
  --vps-hostname=<host> \
  --agent-name=<name> \
  --branch=<branch> \
  --gateway-port=<port> \
  --api-key=<key> \
  --github-pat=<pat> \
  --verbose
```

### Step 6: Monitor Progress

Poll the output periodically. Key milestones to watch for:

- Phase 00: "Preflight Checks" passed
- Phase 20: "User created successfully"
- Phase 30: Node.js + pnpm versions confirmed
- Phase 40: "pnpm install" + "pnpm build" complete (longest phase)
- Phase 60: "Service is running (status: active)"
- Phase 70: "Gateway responding on port XXXXX" + "DEPLOYMENT SUCCESSFUL"

### Step 7: Register Server Config

After successful provisioning, add the server entry to the appropriate config file:

- Production instances -> `.github/servers/production.json`
- Development instances -> `.github/servers/development.json`

### Step 8: Lessons Learned

After provisioning, review the full output for improvement observations using the
`lessons-learned` skill. Common findings:

- Version drift (pnpm, Node.js updates available)
- SSH round-trip inefficiencies
- Health check timing
- Output formatting issues
- Missing flags or options

## Key Flags Reference

### Modes

- `--mode=remote` — Orchestrate via SSH (auto-detected when `--vps-hostname` is set)
- `--update` — Pull latest + rebuild existing install
- `--decommission` — Stop services, free disk, preserve config

### Configuration

- `--vps-hostname=HOST` — Target server (implies remote mode)
- `--agent-name=NAME` — Agent name (derives username as `openclaw-{name}`)
- `--branch=BRANCH` — Git branch to deploy (default: main)
- `--gateway-port=PORT` — Gateway listen port (default: 18789)
- `--api-key=KEY` — Anthropic API key (required)
- `--github-pat=TOKEN` — GitHub PAT for private repo access
- `--tenant=NAME` — Tenant identifier for multi-tenant setups
- `--profile=PROFILE` — Load from profile file

### Execution Control

- `--dry-run` — Preview without executing
- `--start-from=PHASE` — Resume from a specific phase
- `--skip-phase=PHASE` — Skip a phase (repeatable)
- `--verbose` — Debug-level logging

## Multi-Tenant Considerations

When deploying multiple agents on the same server:

- Each agent gets its own Linux user (`openclaw-{name}`)
- Each needs a unique gateway port
- Bridge port conventionally follows gateway port + 1
- Config directories are isolated under each user's home
- Use `--tenant=NAME` for config path suffixing when agents share a username

## Troubleshooting

### Service won't start

```bash
ssh openclaw-{name}@<host> "systemctl --user status openclaw-gateway"
ssh openclaw-{name}@<host> "journalctl --user -u openclaw-gateway -n 50"
```

### Health check fails

The gateway may need more warmup time. Check if the process is running:

```bash
ssh openclaw-{name}@<host> "systemctl --user is-active openclaw-gateway"
```

### Resume after failure

The framework saves checkpoints. Resume from the last successful phase:

```bash
bash setup/setup.sh --start-from=50 --vps-hostname=<host> --agent-name=<name> ...
```

### Rollback

Automatic on phase failure. Manual rollback:

```bash
bash setup/phases/99-rollback.sh
```
