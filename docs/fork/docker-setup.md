# Docker Gateway Setup

This guide covers the proper setup for running the OpenClaw gateway in Docker with authentication.

## Gateway Token Authentication

The `OPENCLAW_GATEWAY_TOKEN` environment variable is required for WebSocket authentication between the web UI and the gateway. Without it, you'll see "Disconnected from gateway" errors.

### Generate a Token

```bash
openssl rand -hex 32
```

Save this token securely - you'll need it for both the Docker container and web UI access.

## Environment File Setup

Create environment files in the repository root (alongside `docker-compose.yml`):

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

## Initial Configuration

Before the gateway will start, create a config file with required settings:

```bash
mkdir -p ~/.openclaw-dev
cat > ~/.openclaw-dev/openclaw.json << 'EOF'
{
  "gateway": {
    "port": 18788,
    "mode": "local",
    "bind": "lan",
    "controlUi": {
      "enabled": true,
      "allowInsecureAuth": true,
      "dangerouslyDisableDeviceAuth": true
    },
    "auth": {
      "mode": "token",
      "allowTailscale": true
    },
    "tailscale": {
      "mode": "off"
    },
    "trustedProxies": ["127.0.0.1", "172.25.0.1", "172.17.0.1", "::1"]
  }
}
EOF
```

For PRD, use port `18789` in the config.

## Starting Containers

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

## Troubleshooting

### "Disconnected from gateway" Error

Verify the token is set in the container:

```bash
docker exec openclaw_DEV_gw env | grep TOKEN
```

If empty, check that `OPENCLAW_GATEWAY_TOKEN` is set in your `.env.*` file.

### "Missing config" Error

The gateway requires a config file with `gateway.mode=local`. Create it:

```bash
echo '{"gateway":{"mode":"local"}}' > ~/.openclaw-dev/openclaw.json
```

### Container Logs

```bash
docker logs openclaw_DEV_gw
```

## Security Notes

- Never commit tokens to version control
- `.env.dev` and `.env.prd` are gitignored
- Use absolute paths in env files (not `~`)
