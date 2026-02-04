# Multi-Environment Docker Deployment

This guide explains how to run OpenClaw in multiple environments (DEV and PRD) using Docker Compose with environment-based configuration.

## Overview

### Purpose

OpenClaw supports running multiple isolated environments on the same host machine:

- **DEV** (Development): For testing new features, experimentation, and development work
- **PRD** (Production): For stable, production usage

Each environment runs in complete isolation with:
- Separate Docker images (`:dev` vs `:prd` tags)
- Separate configuration directories
- Separate ports (no conflicts)
- Separate container names

### Architecture

The deployment uses a **single canonical `docker-compose.yml`** file across all branches. Environment-specific configuration is controlled entirely through `.env` files:

```
main branch (upstream)
├── docker-compose.yml    ← Single source of truth (neutral defaults)
├── .env.example          ← Documents DEV and PRD configurations
└── docs/                 ← This guide

DEV branch
├── docker-compose.yml    ← Same as main (synced via merge)
├── .env                  ← DEV configuration (not committed)
└── (20+ commits ahead)

PRD branch
├── docker-compose.yml    ← Same as main (synced via merge)
├── .env                  ← PRD configuration (not committed)
└── (synced from DEV)
```

**Benefits:**
- No branch divergence → no merge conflicts
- Single source of truth for Docker configuration
- Standard Docker best practices
- Self-documenting via `.env.example`
- Impossible to accidentally deploy wrong environment

## Quick Start

### Single Environment Setup

```bash
# 1. Clone and checkout desired branch
git checkout DEV  # or PRD

# 2. Copy environment template
cp .env.example .env

# 3. Edit .env file
# - Uncomment the DEV or PRD section (not both)
# - Replace placeholder tokens with real values
# - Save the file

# 4. Deploy
docker-compose up -d

# 5. Verify
docker ps | grep openclaw
```

### Running Both Environments Simultaneously

You can run DEV and PRD at the same time without conflicts:

```bash
# Terminal 1 - DEV environment
cd /path/to/openclaw-dev
git checkout DEV
cp .env.example .env
# Edit .env: uncomment DEV section, add real tokens
docker-compose up -d

# Terminal 2 - PRD environment
cd /path/to/openclaw-prd
git checkout PRD
cp .env.example .env
# Edit .env: uncomment PRD section, add real tokens
docker-compose up -d

# Both run without conflicts
```

## Environment Configuration

### DEV Environment

Development environment configuration (in `.env`):

```bash
OPENCLAW_IMAGE=ghcr.io/nikolasp98/openclaw:dev
OPENCLAW_GATEWAY_CONTAINER_NAME=openclaw_DEV_gw
OPENCLAW_CLI_CONTAINER_NAME=openclaw_DEV_cli
OPENCLAW_CONFIG_DIR=/home/nikolas/.openclaw-dev
OPENCLAW_WORKSPACE_DIR=/home/nikolas/.openclaw-dev/workspace
OPENCLAW_GATEWAY_PORT=18788
OPENCLAW_BRIDGE_PORT=18791
OPENCLAW_GATEWAY_BIND=lan
OPENCLAW_GATEWAY_TOKEN=<your-dev-token>
```

**Key characteristics:**
- Uses `:dev` image tag (built from `DEV` branch)
- Non-standard ports (18788, 18791) to avoid conflicts
- Separate config directory (`~/.openclaw-dev`)
- Container names include `_DEV_` prefix

### PRD Environment

Production environment configuration (in `.env`):

```bash
OPENCLAW_IMAGE=ghcr.io/nikolasp98/openclaw:prd
OPENCLAW_GATEWAY_CONTAINER_NAME=openclaw_PRD_gw
OPENCLAW_CLI_CONTAINER_NAME=openclaw_PRD_cli
OPENCLAW_CONFIG_DIR=/home/nikolas/.openclaw-prd
OPENCLAW_WORKSPACE_DIR=/home/nikolas/.openclaw-prd/workspace
OPENCLAW_GATEWAY_PORT=18789
OPENCLAW_BRIDGE_PORT=18790
OPENCLAW_GATEWAY_BIND=lan
OPENCLAW_GATEWAY_TOKEN=<your-prd-token>
```

**Key characteristics:**
- Uses `:prd` image tag (built from `PRD` branch)
- Standard ports (18789, 18790)
- Separate config directory (`~/.openclaw-prd`)
- Container names include `_PRD_` prefix

### Shared Configuration

These variables are the same across both environments:

```bash
# Claude AI credentials (optional)
CLAUDE_AI_SESSION_KEY=<your-session-key>
CLAUDE_WEB_SESSION_KEY=<your-web-session-key>
CLAUDE_WEB_COOKIE=<your-cookie>

# Host-specific paths (optional, use defaults if unset)
OPENCLAW_GOG_CONFIG_DIR=~/.config/gogcli
TAILSCALE_SOCKET=/var/run/tailscale/tailscaled.sock
TAILSCALE_BINARY=/usr/bin/tailscale
```

## Configuration Reference

### Environment Variables

| Variable | Required | DEV Value | PRD Value | Description |
|----------|----------|-----------|-----------|-------------|
| `OPENCLAW_IMAGE` | Yes | `ghcr.io/nikolasp98/openclaw:dev` | `ghcr.io/nikolasp98/openclaw:prd` | Docker image tag |
| `OPENCLAW_GATEWAY_CONTAINER_NAME` | Yes | `openclaw_DEV_gw` | `openclaw_PRD_gw` | Gateway container name |
| `OPENCLAW_CLI_CONTAINER_NAME` | Yes | `openclaw_DEV_cli` | `openclaw_PRD_cli` | CLI container name |
| `OPENCLAW_CONFIG_DIR` | Yes | `/home/nikolas/.openclaw-dev` | `/home/nikolas/.openclaw-prd` | Config directory |
| `OPENCLAW_WORKSPACE_DIR` | Yes | `/home/nikolas/.openclaw-dev/workspace` | `/home/nikolas/.openclaw-prd/workspace` | Workspace directory |
| `OPENCLAW_GATEWAY_PORT` | Yes | `18788` | `18789` | External gateway port |
| `OPENCLAW_BRIDGE_PORT` | Yes | `18791` | `18790` | External bridge port |
| `OPENCLAW_GATEWAY_BIND` | Yes | `lan` | `lan` | Network binding mode |
| `OPENCLAW_GATEWAY_TOKEN` | Yes | (unique token) | (unique token) | Auth token for gateway |
| `CLAUDE_AI_SESSION_KEY` | No | (optional) | (optional) | Claude AI session key |
| `CLAUDE_WEB_SESSION_KEY` | No | (optional) | (optional) | Claude web session key |
| `CLAUDE_WEB_COOKIE` | No | (optional) | (optional) | Claude web cookie |
| `OPENCLAW_GOG_CONFIG_DIR` | No | `~/.config/gogcli` | `~/.config/gogcli` | GOG CLI config dir |
| `TAILSCALE_SOCKET` | No | `/var/run/tailscale/tailscaled.sock` | `/var/run/tailscale/tailscaled.sock` | Tailscale socket |
| `TAILSCALE_BINARY` | No | `/usr/bin/tailscale` | `/usr/bin/tailscale` | Tailscale binary |

### Port Allocation Strategy

| Environment | Gateway | Bridge | Purpose |
|-------------|---------|--------|---------|
| DEV | 18788 | 18791 | Non-standard ports to avoid conflicts |
| PRD | 18789 | 18790 | Standard OpenClaw ports |

This allocation allows both environments to run simultaneously without port conflicts.

### Directory Isolation

Each environment uses separate configuration and workspace directories:

```
~/.openclaw-dev/          ← DEV config
├── config.json
├── sessions/
└── workspace/

~/.openclaw-prd/          ← PRD config
├── config.json
├── sessions/
└── workspace/
```

This ensures complete state isolation between environments.

## Common Operations

### Starting an Environment

```bash
# Start in foreground (see logs)
docker-compose up

# Start in background (detached)
docker-compose up -d
```

### Stopping an Environment

```bash
# Stop containers (preserves volumes)
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f openclaw-gateway

# Last 100 lines
docker-compose logs --tail=100
```

### Updating Images

```bash
# Pull latest image
docker-compose pull

# Restart with new image
docker-compose up -d
```

### Switching Environments

```bash
# Stop current environment
docker-compose down

# Switch branch
git checkout PRD  # or DEV

# Update .env file (uncomment different section)
vim .env

# Start new environment
docker-compose up -d
```

### Accessing CLI

```bash
# Interactive shell
docker-compose run --rm openclaw-cli

# One-off command
docker-compose run --rm openclaw-cli config list

# Execute in running container
docker exec -it openclaw_DEV_cli node dist/index.js config list
```

## Troubleshooting

### Port Conflicts

**Symptom:** `Error starting userland proxy: listen tcp4 0.0.0.0:18789: bind: address already in use`

**Solution:**
```bash
# Check what's using the port
ss -ltnp | grep 18789

# If it's another OpenClaw instance, stop it
cd /path/to/other/environment
docker-compose down

# Or use different ports in .env
OPENCLAW_GATEWAY_PORT=18799
OPENCLAW_BRIDGE_PORT=18800
```

### Container Name Collisions

**Symptom:** `Error response from daemon: Conflict. The container name "/openclaw_gateway" is already in use`

**Solution:**
```bash
# Check running containers
docker ps -a | grep openclaw

# Remove old container
docker rm -f openclaw_gateway

# Or use different container names in .env
OPENCLAW_GATEWAY_CONTAINER_NAME=openclaw_test_gw
```

### Volume Permission Issues

**Symptom:** `Error: EACCES: permission denied, open '/home/node/.openclaw/config.json'`

**Solution:**
```bash
# Ensure directories exist and have correct permissions
mkdir -p ~/.openclaw-dev ~/.openclaw-prd
chmod -R 755 ~/.openclaw-dev ~/.openclaw-prd

# If needed, change ownership (Docker runs as node user, UID 1000)
chown -R 1000:1000 ~/.openclaw-dev
```

### Missing Environment Variables

**Symptom:** Container starts but gateway fails with authentication errors

**Solution:**
```bash
# Verify .env file exists and has correct values
cat .env | grep OPENCLAW_GATEWAY_TOKEN

# Ensure no typos in variable names
docker-compose config | grep -A5 environment

# Restart after fixing .env
docker-compose down && docker-compose up -d
```

### Image Pull Failures

**Symptom:** `Error response from daemon: manifest for ghcr.io/nikolasp98/openclaw:dev not found`

**Solution:**
```bash
# Check if image tag exists
docker pull ghcr.io/nikolasp98/openclaw:dev

# Verify GitHub Container Registry authentication (if private)
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Use local image for testing
OPENCLAW_IMAGE=openclaw:local
```

### Wrong Environment Running

**Symptom:** You expected DEV but PRD is running, or vice versa

**Solution:**
```bash
# Check which containers are running
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}"

# Verify .env file
cat .env | grep OPENCLAW_IMAGE

# Check ports
ss -ltnp | grep -E "1878[89]|1879[01]"

# Stop everything and start clean
docker-compose down
# Edit .env to uncomment correct section
docker-compose up -d
```

## Advanced Topics

### Customizing Environment Variables

You can override any default value by adding it to your `.env` file:

```bash
# Use custom config directory
OPENCLAW_CONFIG_DIR=/mnt/storage/openclaw-dev

# Use custom ports
OPENCLAW_GATEWAY_PORT=19999
OPENCLAW_BRIDGE_PORT=20000

# Use different Tailscale socket
TAILSCALE_SOCKET=/var/lib/tailscale/tailscaled.sock
```

### Adding New Variables

To add new environment variables:

1. Add them to `docker-compose.yml`:
```yaml
environment:
  NEW_VAR: ${NEW_VAR}
```

2. Document in `.env.example`:
```bash
# NEW_VAR=default-value
```

3. Set in your local `.env`:
```bash
NEW_VAR=my-value
```

### Clean Shutdown and Restart

For a clean restart (preserves data):

```bash
# Stop containers
docker-compose down

# Pull latest images
docker-compose pull

# Start with fresh containers
docker-compose up -d
```

For a complete reset (destroys data):

```bash
# Stop and remove everything including volumes
docker-compose down -v

# Remove config directories
rm -rf ~/.openclaw-dev ~/.openclaw-prd

# Start fresh
cp .env.example .env
# Edit .env
docker-compose up -d
```

### Verifying Both Environments

```bash
# Check containers
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}" | grep openclaw

# Expected output:
# openclaw_DEV_gw    ghcr.io/nikolasp98/openclaw:dev    18788->18789, 18791->18790
# openclaw_DEV_cli   ghcr.io/nikolasp98/openclaw:dev
# openclaw_PRD_gw    ghcr.io/nikolasp98/openclaw:prd    18789->18789, 18790->18790
# openclaw_PRD_cli   ghcr.io/nikolasp98/openclaw:prd

# Check ports
ss -ltnp | grep -E "1878[89]|1879[01]"

# Expected output:
# tcp LISTEN 0.0.0.0:18788 (DEV gateway)
# tcp LISTEN 0.0.0.0:18791 (DEV bridge)
# tcp LISTEN 0.0.0.0:18789 (PRD gateway)
# tcp LISTEN 0.0.0.0:18790 (PRD bridge)

# Check config directories
ls -la ~/.openclaw-dev ~/.openclaw-prd

# Test connectivity
curl http://localhost:18788/health  # DEV
curl http://localhost:18789/health  # PRD
```

## CI/CD Integration

The GitHub Actions workflow automatically builds environment-specific images:

- Pushes to `DEV` branch → `ghcr.io/nikolasp98/openclaw:dev`
- Pushes to `PRD` branch → `ghcr.io/nikolasp98/openclaw:prd`
- Pushes to `main` branch → `ghcr.io/nikolasp98/openclaw:main`

After pushing to a branch, wait for the workflow to complete, then pull the new image:

```bash
docker-compose pull
docker-compose up -d
```

## Security Best Practices

1. **Never commit `.env` files** - They contain secrets
2. **Use unique tokens** per environment - Generate with `openssl rand -hex 32`
3. **Restrict access** to `.env` files - `chmod 600 .env`
4. **Rotate tokens** regularly - Update `.env` and restart
5. **Use separate credentials** for DEV and PRD when possible
6. **Backup `.env` files** securely - Use a password manager

## Related Documentation

- [OpenClaw Docker Installation](../install/docker.md) - Basic Docker setup
- [Gateway Configuration](../gateway/configuration.md) - Gateway options
- [CLI Profile System](../cli/profiles.md) - Alternative multi-environment approach
