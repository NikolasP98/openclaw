# Docker Gateway Setup

This guide covers the proper setup for running the OpenClaw gateway in Docker with authentication.

## Gateway Token Authentication

The `OPENCLAW_GATEWAY_TOKEN` environment variable is required for WebSocket authentication between the web UI and the gateway. Without it, you'll see "Disconnected from gateway" errors.

### Generate a Token

```bash
openssl rand -hex 32
```

Save this token securely - you'll need it for both the Docker container and web UI access.

## Docker Compose Configuration

### PRD Environment (Port 18789)

```yaml
services:
  openclaw-gateway:
    image: ghcr.io/nikolasp98/openclaw:prd
    container_name: openclaw_PRD_gw
    environment:
      OPENCLAW_GATEWAY_TOKEN: ${OPENCLAW_GATEWAY_TOKEN_PRD}  # Required for auth
    volumes:
      - ~/.openclaw-prd:/home/node/.openclaw
    network_mode: host
    command: ["node", "dist/index.js", "gateway", "--bind", "lan", "--port", "18789"]
```

### DEV Environment (Port 18788)

```yaml
services:
  openclaw-gateway:
    image: ghcr.io/nikolasp98/openclaw:dev
    container_name: openclaw_DEV_gw
    environment:
      OPENCLAW_GATEWAY_TOKEN: ${OPENCLAW_GATEWAY_TOKEN_DEV}  # Required for auth
    volumes:
      - ~/.openclaw-dev:/home/node/.openclaw
    network_mode: host
    command: ["node", "dist/index.js", "gateway", "--bind", "lan", "--port", "18788"]
```

### Running Both Environments

To run DEV and PRD side by side, use different ports (18788 for DEV, 18789 for PRD) and separate tokens.

### Environment File

Create a `.env` file alongside your `docker-compose.yml`:

```bash
# Use separate tokens for each environment
OPENCLAW_GATEWAY_TOKEN_PRD=your-prd-token-here
OPENCLAW_GATEWAY_TOKEN_DEV=your-dev-token-here
```

Alternatively, export the variables in your shell before running `docker compose up`.

## Setup Steps

1. **Generate tokens for each environment:**
   ```bash
   export OPENCLAW_GATEWAY_TOKEN_PRD=$(openssl rand -hex 32)
   export OPENCLAW_GATEWAY_TOKEN_DEV=$(openssl rand -hex 32)
   echo "PRD token: $OPENCLAW_GATEWAY_TOKEN_PRD"
   echo "DEV token: $OPENCLAW_GATEWAY_TOKEN_DEV"
   ```

2. **Create your docker-compose.yml** with the token environment variables (see examples above)

3. **Start the containers:**
   ```bash
   docker compose up -d
   ```

4. **Access the web UI** with the token as a query parameter:
   - **PRD:** `http://your-host:18789/?token=your-prd-token`
   - **DEV:** `http://your-host:18788/?token=your-dev-token`

## Troubleshooting

### "Disconnected from gateway" Error

This error means the token is not being passed to the container correctly.

**Verify the token is set in the container:**
```bash
docker exec <container-name> env | grep TOKEN
```

If empty, check that:
- The `OPENCLAW_GATEWAY_TOKEN` variable is exported in your shell or defined in `.env`
- The `docker-compose.yml` includes `OPENCLAW_GATEWAY_TOKEN: ${OPENCLAW_GATEWAY_TOKEN}`

### Token Mismatch

Ensure you're using the same token in:
1. The container's `OPENCLAW_GATEWAY_TOKEN` environment variable
2. The `?token=` query parameter when accessing the web UI

### Container Logs

Check the gateway logs for authentication errors:
```bash
docker logs <container-name> | grep -i auth
```

## Security Notes

- Never commit your token to version control
- Use environment variables or secrets management for production deployments
- The token should be treated like a password
