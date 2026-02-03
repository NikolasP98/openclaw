# Fork-Specific: Docker Environment Naming

This fork adds support for environment-specific container naming.

## Environment Variables

- `OPENCLAW_ENV` — environment name (default: `DEV`)
- `OPENCLAW_GATEWAY_CONTAINER_NAME` — gateway container name (default: `openclaw_${OPENCLAW_ENV}_gw`)
- `OPENCLAW_CLI_CONTAINER_NAME` — CLI container name (default: `openclaw_${OPENCLAW_ENV}_cli`)

## Usage

```bash
# Use default DEV environment
./docker-setup.sh

# Use custom environment name
OPENCLAW_ENV=staging ./docker-setup.sh

# Fully custom container names
OPENCLAW_GATEWAY_CONTAINER_NAME=my-gateway ./docker-setup.sh
```

## Benefits

- Run multiple environments side-by-side (DEV, staging, prod)
- Clear container naming in `docker ps`
- No name conflicts between environments

## Image Defaults Per Branch

Each branch has environment-specific GHCR image defaults:

- **PRD**: `ghcr.io/nikolasp98/openclaw:prd`
- **DEV**: `ghcr.io/nikolasp98/openclaw:dev`
- **main**: `ghcr.io/nikolasp98/openclaw:main`

This means you can deploy without manually specifying the image:

```bash
# On PRD branch - automatically pulls ghcr.io/nikolasp98/openclaw:prd
git checkout PRD
./docker-setup.sh

# On DEV branch - automatically pulls ghcr.io/nikolasp98/openclaw:dev
git checkout DEV
./docker-setup.sh
```

Override with a custom image if needed:

```bash
OPENCLAW_IMAGE=ghcr.io/nikolasp98/openclaw:custom ./docker-setup.sh
```

Or build locally:

```bash
OPENCLAW_IMAGE=openclaw:local ./docker-setup.sh
```

## GOG Credentials for Gmail Hooks

For Gmail Pub/Sub hooks to work in containers, GOG (Google OAuth CLI) credentials must be accessible.

**Default mount**: `~/.config/gogcli` → `/home/node/.config/gogcli`

**Custom path**:
```bash
OPENCLAW_GOG_CONFIG_DIR=/custom/path/gogcli ./docker-setup.sh
```

**Setup GOG credentials**:
1. Run GOG authentication on host: `gog auth login`
2. Credentials stored at `~/.config/gogcli/credentials.json`
3. Start/restart container with mount
4. Container can now access GOG credentials

**Verify in container**:
```bash
docker compose exec openclaw-gateway ls -la /home/node/.config/gogcli
```

## Implementation Details

The feature is implemented in two files:

### docker-compose.yml

Both services use the container_name directive with environment variable fallbacks:

```yaml
services:
  openclaw-gateway:
    container_name: ${OPENCLAW_GATEWAY_CONTAINER_NAME:-openclaw_DEV_gw}
    # ...

  openclaw-cli:
    container_name: ${OPENCLAW_CLI_CONTAINER_NAME:-openclaw_DEV_cli}
    # ...
```

### docker-setup.sh

The setup script exports the environment variables with sensible defaults:

```bash
export OPENCLAW_ENV="${OPENCLAW_ENV:-DEV}"
export OPENCLAW_GATEWAY_CONTAINER_NAME="${OPENCLAW_GATEWAY_CONTAINER_NAME:-openclaw_${OPENCLAW_ENV}_gw}"
export OPENCLAW_CLI_CONTAINER_NAME="${OPENCLAW_CLI_CONTAINER_NAME:-openclaw_${OPENCLAW_ENV}_cli}"
```

## Service Names vs Container Names

Note that `docker compose` commands use **service names** (`openclaw-gateway`, `openclaw-cli`), not container names. The container names are visible in `docker ps` output and used for direct `docker` commands (not `docker compose`).

Example:

```bash
# Use service name with docker compose
docker compose logs -f openclaw-gateway

# Use container name with docker
docker logs -f openclaw_DEV_gw
```
