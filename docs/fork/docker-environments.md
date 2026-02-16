# Fork-Specific: Docker Environment Naming

This fork adds support for environment-specific container naming.

## Environment Variables

- `MINION_ENV` — environment name (default: `DEV`)
- `MINION_GATEWAY_CONTAINER_NAME` — gateway container name (default: `minion_${MINION_ENV}_gw`)
- `MINION_CLI_CONTAINER_NAME` — CLI container name (default: `minion_${MINION_ENV}_cli`)

## Usage

```bash
# Use default DEV environment
./docker-setup.sh

# Use custom environment name
MINION_ENV=staging ./docker-setup.sh

# Fully custom container names
MINION_GATEWAY_CONTAINER_NAME=my-gateway ./docker-setup.sh
```

## Benefits

- Run multiple environments side-by-side (DEV, staging, prod)
- Clear container naming in `docker ps`
- No name conflicts between environments

## Image Defaults Per Branch

Each branch has environment-specific GHCR image defaults:

- **PRD**: `ghcr.io/nikolasp98/minion:prd`
- **DEV**: `ghcr.io/nikolasp98/minion:dev`
- **main**: `ghcr.io/nikolasp98/minion:main`

This means you can deploy without manually specifying the image:

```bash
# On PRD branch - automatically pulls ghcr.io/nikolasp98/minion:prd
git checkout PRD
./docker-setup.sh

# On DEV branch - automatically pulls ghcr.io/nikolasp98/minion:dev
git checkout DEV
./docker-setup.sh
```

Override with a custom image if needed:

```bash
MINION_IMAGE=ghcr.io/nikolasp98/minion:custom ./docker-setup.sh
```

Or build locally:

```bash
MINION_IMAGE=minion:local ./docker-setup.sh
```

## GOG Credentials for Gmail Hooks

For Gmail Pub/Sub hooks to work in containers, GOG (Google OAuth CLI) credentials must be accessible.

**Default mount**: `~/.config/gogcli` → `/home/node/.config/gogcli`

**Custom path**:

```bash
MINION_GOG_CONFIG_DIR=/custom/path/gogcli ./docker-setup.sh
```

**Setup GOG credentials**:

1. Run GOG authentication on host: `gog auth login`
2. Credentials stored at `~/.config/gogcli/credentials.json`
3. Start/restart container with mount
4. Container can now access GOG credentials

**Verify in container**:

```bash
docker compose exec minion-gateway ls -la /home/node/.config/gogcli
```

## Implementation Details

The feature is implemented in two files:

### docker-compose.yml

Both services use the container_name directive with environment variable fallbacks:

```yaml
services:
  minion-gateway:
    container_name: ${MINION_GATEWAY_CONTAINER_NAME:-minion_DEV_gw}
    # ...

  minion-cli:
    container_name: ${MINION_CLI_CONTAINER_NAME:-minion_DEV_cli}
    # ...
```

### docker-setup.sh

The setup script exports the environment variables with sensible defaults:

```bash
export MINION_ENV="${MINION_ENV:-DEV}"
export MINION_GATEWAY_CONTAINER_NAME="${MINION_GATEWAY_CONTAINER_NAME:-minion_${MINION_ENV}_gw}"
export MINION_CLI_CONTAINER_NAME="${MINION_CLI_CONTAINER_NAME:-minion_${MINION_ENV}_cli}"
```

## Service Names vs Container Names

Note that `docker compose` commands use **service names** (`minion-gateway`, `minion-cli`), not container names. The container names are visible in `docker ps` output and used for direct `docker` commands (not `docker compose`).

Example:

```bash
# Use service name with docker compose
docker compose logs -f minion-gateway

# Use container name with docker
docker logs -f minion_DEV_gw
```
