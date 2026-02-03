# Docker Gateway Setup

This guide covers running the OpenClaw gateway in Docker. The image comes pre-configured with sensible defaults - you only need to provide an authentication token.

## Quick Start

```bash
# Generate a secure token
export OPENCLAW_GATEWAY_TOKEN=$(openssl rand -hex 32)
echo "Your token: $OPENCLAW_GATEWAY_TOKEN"

# Run the gateway
docker run -d \
  -e OPENCLAW_GATEWAY_TOKEN \
  -p 18789:18789 \
  ghcr.io/nikolasp98/openclaw:dev

# Access the UI
open "http://localhost:18789/?token=$OPENCLAW_GATEWAY_TOKEN"
```

The gateway starts immediately with the Control UI enabled. No config files or volume mounts required.

## Gateway Token Authentication

The `OPENCLAW_GATEWAY_TOKEN` environment variable is required for WebSocket authentication between the web UI and the gateway. Without it, you'll see "Disconnected from gateway" errors.

### Generate a Token

```bash
openssl rand -hex 32
```

Save this token securely - you'll need it for both the Docker container and web UI access.

## Environment File Setup (Multi-Environment)

For running multiple environments (DEV/PRD), create environment files in the repository root:

### `.env.dev` (DEV environment)

```bash
# DEV environment configuration
OPENCLAW_IMAGE=ghcr.io/nikolasp98/openclaw:dev
OPENCLAW_GATEWAY_CONTAINER_NAME=openclaw_DEV_gw
OPENCLAW_CLI_CONTAINER_NAME=openclaw_DEV_cli
OPENCLAW_CONFIG_DIR=/path/to/.openclaw-dev
OPENCLAW_WORKSPACE_DIR=/path/to/.openclaw-dev/workspace
OPENCLAW_GATEWAY_PORT=18788
OPENCLAW_BRIDGE_PORT=18791
OPENCLAW_GATEWAY_TOKEN=your-dev-token-here
```

### `.env.prd` (PRD environment)

```bash
# PRD environment configuration
OPENCLAW_IMAGE=ghcr.io/nikolasp98/openclaw:prd
OPENCLAW_GATEWAY_CONTAINER_NAME=openclaw_PRD_gw
OPENCLAW_CLI_CONTAINER_NAME=openclaw_PRD_cli
OPENCLAW_CONFIG_DIR=/path/to/.openclaw-prd
OPENCLAW_WORKSPACE_DIR=/path/to/.openclaw-prd/workspace
OPENCLAW_GATEWAY_PORT=18789
OPENCLAW_BRIDGE_PORT=18790
OPENCLAW_GATEWAY_TOKEN=your-prd-token-here
```

These files are gitignored (`.env.dev`, `.env.prd`) to prevent committing tokens.

## Starting with Docker Compose

### Start DEV Gateway

```bash
docker compose --env-file .env.dev up -d openclaw-gateway
```

### Start PRD Gateway

```bash
docker compose --env-file .env.prd up -d openclaw-gateway
```

### Running Both Environments

Run DEV and PRD simultaneously using different env files:

```bash
# Terminal 1: Start DEV
docker compose --env-file .env.dev up -d openclaw-gateway

# Terminal 2: Start PRD
docker compose --env-file .env.prd up -d openclaw-gateway
```

Each uses different:
- Container names (`openclaw_DEV_gw` vs `openclaw_PRD_gw`)
- Ports (18788 for DEV, 18789 for PRD)
- Config directories (`~/.openclaw-dev` vs `~/.openclaw-prd`)
- Tokens

## Access the Web UI

Access the UI with your token as a query parameter:

- **DEV:** `http://your-host:18788/?token=your-dev-token`
- **PRD:** `http://your-host:18789/?token=your-prd-token`

## Pre-baked Configuration

The Docker image includes an entrypoint that populates missing config and directories at startup. This works seamlessly with mounted volumes:

- If you mount an empty volume to `~/.openclaw`, the entrypoint creates all required subdirectories and copies the default config
- If your mount already has an `openclaw.json`, it's preserved (not overwritten)
- Missing subdirectories are created automatically

Default configuration includes:
- Control UI enabled with token authentication
- LAN binding for container networking
- Trusted proxies for common Docker networks
- Reasonable defaults for tools and sessions

### Portainer Setup

In Portainer, configure:
1. **Image:** `ghcr.io/nikolasp98/openclaw:dev` (or `:prd`)
2. **Environment variable:** `OPENCLAW_GATEWAY_TOKEN` = your token
3. **Ports:**
   - `18789` - Gateway WebSocket and Control UI
   - `18790` - Bridge port (for external WebSocket connections)
4. **Volumes (optional):**
   - `/path/to/.openclaw:/home/node/.openclaw` - config and data
   - `/path/to/workspace:/home/node/.openclaw/workspace` - workspace files
   - `/path/to/gogcli:/home/node/.config/gogcli` - Google CLI credentials

The entrypoint handles populating any missing files/directories in your mounted volumes.

### Custom Config

To use your own config, either:

1. Mount a volume and let the entrypoint create the default, then modify it
2. Mount your config file directly:

```bash
docker run -d \
  -e OPENCLAW_GATEWAY_TOKEN \
  -v /path/to/your/openclaw.json:/home/node/.openclaw/openclaw.json:ro \
  -p 18789:18789 \
  ghcr.io/nikolasp98/openclaw:dev
```

## Troubleshooting

### "Disconnected from gateway" Error

Verify the token is set in the container:

```bash
docker exec openclaw_DEV_gw env | grep TOKEN
```

If empty, check that `OPENCLAW_GATEWAY_TOKEN` is set in your `.env.*` file or passed via `-e`.

### Container Logs

```bash
docker logs openclaw_DEV_gw
```

## Security Notes

- Never commit tokens to version control
- `.env.dev` and `.env.prd` are gitignored
- Use absolute paths in env files (not `~`)
