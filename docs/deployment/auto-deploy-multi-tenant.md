# Automatic Multi-Tenant Production Deployment

This document describes the automatic deployment system for OpenClaw production servers.

## Overview

OpenClaw uses a **phased GitHub Actions-based automatic deployment** system that:
- Triggers automatically when the PRD branch is pushed
- Builds and pushes Docker images to GHCR (GitHub Container Registry)
- Deploys to production servers via SSH
- Validates deployments with health checks
- Automatically rolls back on failure
- Supports scaling from single server to multi-tenant architecture

## Architecture Phases

### Phase 1: Single Server Deployment (Current)

**Status**: ✅ Implemented
**Workflow**: `.github/workflows/deploy-prd.yml`
**Scales to**: 1 server

Automatic deployment to a single production server (100.105.147.99):
1. Docker Release workflow builds and pushes images to GHCR
2. Deploy workflow triggers on PRD branch push
3. Copies `docker-compose.yml` to server
4. Pulls latest images
5. Gracefully stops and restarts containers
6. Runs health checks
7. Automatically rolls back on failure

### Phase 2: Multi-Server with Registry (Future)

**Status**: 🚧 Prepared (disabled by default)
**Workflow**: `.github/workflows/deploy-prd-multi.yml` (rename to `deploy-prd.yml` to activate)
**Server Registry**: `.github/servers/production.json`
**Scales to**: 2-20 servers

Multi-tenant deployment using JSON-based server registry:
- Deploy to multiple servers in parallel
- Per-tenant isolation (containers, configs, credentials)
- Independent health checks and rollbacks per tenant
- Easy tenant provisioning (add JSON entry, push to PRD)

### Phase 3: Kubernetes Auto-Scaling (Long-term)

**Status**: 📝 Planned
**Scales to**: Unlimited

True auto-scaling with Kubernetes:
- Namespace-per-tenant isolation
- Horizontal Pod Autoscaler (HPA)
- GitOps integration (Flux/ArgoCD)
- Load balancing with Ingress Controller

## Server Preparation (Phase 1)

### 1. Create Dedicated Deployment User

```bash
# SSH to server as root
ssh root@100.105.147.99

# Create deploy user with Docker access
useradd -m -s /bin/bash deploy
usermod -aG docker deploy

# Switch to deploy user
su - deploy
mkdir -p ~/.ssh
chmod 700 ~/.ssh
```

### 2. Generate and Configure SSH Keys

```bash
# On your local machine
ssh-keygen -t ed25519 -C "github-actions-openclaw-deploy" -f ./openclaw_deploy_key -N ""

# Copy public key to server
cat openclaw_deploy_key.pub | ssh root@100.105.147.99 "su - deploy -c 'cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'"

# Test SSH connection
ssh -i openclaw_deploy_key deploy@100.105.147.99 "docker ps"
```

### 3. Create Production Directory Structure

```bash
# SSH as deploy user
ssh -i openclaw_deploy_key deploy@100.105.147.99

# Create deployment directory
mkdir -p ~/openclaw-prd
cd ~/openclaw-prd

# Create persistent data directories
mkdir -p ~/.openclaw-prd/{workspace,agents,canvas,credentials,devices,identity,media,memory,cron,sessions}
mkdir -p ~/.config/gogcli
```

### 4. Create Production Environment File

```bash
# Create ~/openclaw-prd/.env on server
cat > ~/openclaw-prd/.env <<'EOF'
# Docker Configuration
OPENCLAW_IMAGE=ghcr.io/nikolasp98/openclaw:prd
OPENCLAW_GATEWAY_CONTAINER_NAME=openclaw_PRD_gw
OPENCLAW_CLI_CONTAINER_NAME=openclaw_PRD_cli
OPENCLAW_ENV=PRD

# Paths (using deploy user's home)
OPENCLAW_CONFIG_DIR=/home/deploy/.openclaw-prd
OPENCLAW_WORKSPACE_DIR=/home/deploy/.openclaw-prd/workspace
OPENCLAW_GOG_CONFIG_DIR=/home/deploy/.config/gogcli

# Network Configuration
OPENCLAW_GATEWAY_PORT=18789
OPENCLAW_BRIDGE_PORT=18790
OPENCLAW_GATEWAY_BIND=lan

# Authentication (REPLACE WITH SECURE VALUES)
OPENCLAW_GATEWAY_TOKEN=REPLACE_WITH_SECURE_TOKEN
CLAUDE_AI_SESSION_KEY=REPLACE_WITH_YOUR_KEY
CLAUDE_WEB_SESSION_KEY=REPLACE_WITH_YOUR_KEY
CLAUDE_WEB_COOKIE=REPLACE_WITH_YOUR_COOKIE

# Optional: Browser support
OPENCLAW_DOCKER_APT_PACKAGES=chromium fonts-liberation fonts-noto-color-emoji

# Tailscale (if using)
TAILSCALE_SOCKET=/var/run/tailscale/tailscaled.sock
TAILSCALE_BINARY=/usr/bin/tailscale
EOF

# Generate secure gateway token
echo "OPENCLAW_GATEWAY_TOKEN=$(openssl rand -base64 32)" >> ~/.openclaw-prd/.env.token
# Then manually copy this token to .env and delete .env.token
```

### 5. Copy docker-compose.yml to Server

```bash
# From your local machine
scp -i openclaw_deploy_key docker-compose.yml deploy@100.105.147.99:~/openclaw-prd/
```

### 6. Initial Manual Deployment (Verify Setup)

```bash
# SSH to server
ssh -i openclaw_deploy_key deploy@100.105.147.99

# Navigate to deployment directory
cd ~/openclaw-prd

# Pull images
docker compose pull

# Start services
docker compose up -d

# Verify containers are running
docker compose ps

# Check logs
docker compose logs -f openclaw-gateway

# Test health endpoint (in another terminal)
curl http://localhost:18789/health
```

## GitHub Actions Setup

### 1. Add GitHub Secrets

Navigate to: `Repository → Settings → Secrets and variables → Actions → New repository secret`

Add the following secrets:

| Secret Name | Value |
|-------------|-------|
| `SSH_PRIVATE_KEY` | Contents of `openclaw_deploy_key` file (entire file including headers) |
| `SSH_HOST` | `100.105.147.99` |
| `SSH_USER` | `deploy` |
| `SSH_PORT` | `22` |
| `DEPLOYMENT_PATH` | `/home/deploy/openclaw-prd` |

### 2. Deployment Workflow

The deployment workflow (`.github/workflows/deploy-prd.yml`) is already configured and will:

1. **Trigger**: Automatically when Docker Release workflow completes successfully on PRD branch
2. **Setup**: Configure SSH access to production server
3. **Deploy**:
   - Copy latest `docker-compose.yml`
   - Tag current image for rollback
   - Pull new images from GHCR
   - Gracefully stop containers
   - Start new containers
4. **Validate**: Run health checks (3 attempts, 5s intervals)
5. **Rollback**: Automatically revert to previous image if health checks fail
6. **Cleanup**: Remove old/dangling images

## Testing the Deployment

### 1. Trigger Deployment

```bash
# Checkout PRD branch
git checkout PRD

# Make a test commit (or use --allow-empty)
git commit --allow-empty -m "test: trigger automatic deployment"

# Push to trigger workflow
git push origin PRD
```

### 2. Monitor Deployment

1. Go to GitHub repository → Actions tab
2. Watch "Docker Release" workflow complete (builds image)
3. Watch "Deploy to Production" workflow start and complete
4. Check deployment logs for any errors

### 3. Verify on Server

```bash
# SSH to server
ssh -i openclaw_deploy_key deploy@100.105.147.99

# Check running containers
docker ps | grep openclaw

# Check logs
cd ~/openclaw-prd
docker compose logs --tail=50 openclaw-gateway

# Test health endpoint
curl http://localhost:18789/health

# Check image version
docker images | grep openclaw
```

## Scaling to Multi-Tenant (Phase 2)

### Activating Multi-Server Deployment

1. **Disable Phase 1 workflow**:
   ```bash
   mv .github/workflows/deploy-prd.yml .github/workflows/deploy-prd-single.yml.disabled
   ```

2. **Enable Phase 2 workflow**:
   ```bash
   mv .github/workflows/deploy-prd-multi.yml .github/workflows/deploy-prd.yml
   ```

3. **Update server registry**: Edit `.github/servers/production.json`

### Adding New Tenants

**Step 1: Provision new server**

Apply server preparation steps (1-6) to the new server.

**Step 2: Add tenant to server registry**

Edit `.github/servers/production.json`:

```json
{
  "servers": [
    {
      "id": "prd-tenant-acme",
      "host": "100.105.147.99",
      "user": "deploy",
      "port": 22,
      "deployment_path": "/home/deploy/openclaw-prd-acme",
      "container_prefix": "acme",
      "gateway_port": 18789,
      "bridge_port": 18790,
      "tenant": "acme-corp",
      "region": "us-east"
    },
    {
      "id": "prd-tenant-newtenant",
      "host": "<new-server-ip>",
      "user": "deploy",
      "port": 22,
      "deployment_path": "/home/deploy/openclaw-prd-newtenant",
      "container_prefix": "newtenant",
      "gateway_port": 18789,
      "bridge_port": 18790,
      "tenant": "newtenant-corp",
      "region": "us-central"
    }
  ]
}
```

**Step 3: Commit and push**

```bash
git add .github/servers/production.json
git commit -m "feat: add new tenant newtenant-corp"
git push origin PRD
```

Deployment happens automatically to all servers including the new one.

### Removing Tenants

**Step 1: Remove from server registry**

Edit `.github/servers/production.json` and remove the tenant entry.

**Step 2: Commit and push**

```bash
git add .github/servers/production.json
git commit -m "feat: remove tenant oldtenant-corp"
git push origin PRD
```

**Step 3: Manually stop containers on removed server**

```bash
ssh deploy@<server-ip>
cd /home/deploy/openclaw-prd-oldtenant
docker compose down
```

**Step 4: Optional cleanup**

```bash
# Remove deployment directory
rm -rf ~/openclaw-prd-oldtenant
rm -rf ~/.openclaw-prd-oldtenant

# Prune unused images
docker system prune -a
```

## Security Hardening (Optional)

```bash
# SSH to server as root
ssh root@100.105.147.99

# Disable password auth for deploy user (SSH key only)
cat >> /etc/ssh/sshd_config <<EOF

# Deploy user hardening
Match User deploy
    PasswordAuthentication no
    PubkeyAuthentication yes
EOF

# Restart SSH
systemctl restart sshd

# Configure firewall (if using UFW)
ufw allow 22/tcp      # SSH
ufw allow 18789/tcp   # OpenClaw Gateway
ufw allow 18790/tcp   # OpenClaw Bridge
ufw enable
```

## Monitoring and Maintenance

### Daily
- Monitor GitHub Actions for deployment failures
- Check server health endpoint: `curl http://100.105.147.99:18789/health`

### Weekly
- Review container logs: `docker compose logs | grep -i error`
- Check disk usage: `docker system df`

### Monthly
- Prune unused images: `docker system prune -a --volumes`
- Rotate `OPENCLAW_GATEWAY_TOKEN`
- Review SSH access logs

### Quarterly
- Rotate SSH deployment keys
- Update secrets in GitHub Actions
- Review and update `.env` configuration

## Backup Strategy

Create backup script on server (`~/backup-openclaw.sh`):

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/openclaw"
DATE=$(date +%Y%m%d-%H%M%S)
mkdir -p $BACKUP_DIR

# Backup config directory
tar -czf $BACKUP_DIR/openclaw-prd-$DATE.tar.gz ~/.openclaw-prd

# Backup .env and docker-compose.yml
cp ~/openclaw-prd/.env $BACKUP_DIR/env-$DATE
cp ~/openclaw-prd/docker-compose.yml $BACKUP_DIR/docker-compose-$DATE.yml

# Keep only last 7 days
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/openclaw-prd-$DATE.tar.gz"
```

Add to crontab: `0 2 * * * /home/deploy/backup-openclaw.sh`

## Emergency Procedures

### If deployment fails

1. Check GitHub Actions logs for error details
2. SSH to server and check container status: `docker compose ps`
3. Check container logs: `docker compose logs`
4. Rollback will happen automatically if health check fails

### Manual rollback

```bash
ssh deploy@100.105.147.99
cd ~/openclaw-prd
sed -i 's/:prd/:prd-rollback/g' .env
docker compose down && docker compose up -d
sed -i 's/:prd-rollback/:prd/g' .env  # Restore .env after rollback
```

### If containers won't start

```bash
# Check Docker service
sudo systemctl status docker

# Check disk space
df -h

# Check logs
journalctl -u docker -f

# Restart Docker if needed
sudo systemctl restart docker
```

## Verification Checklist

After implementing this system, verify:

- [ ] Deploy user created on server with Docker access
- [ ] SSH key authentication working
- [ ] Production directory structure created (`~/openclaw-prd`)
- [ ] Production `.env` file configured with secure credentials
- [ ] `docker-compose.yml` copied to server
- [ ] Initial manual deployment successful (`docker compose up -d`)
- [ ] Health endpoint responding (`curl http://localhost:18789/health`)
- [ ] GitHub Secrets configured (SSH_PRIVATE_KEY, SSH_HOST, etc.)
- [ ] `.github/workflows/deploy-prd.yml` exists in repository
- [ ] Test deployment successful (empty commit to PRD branch)
- [ ] Deployment visible in GitHub Actions
- [ ] Containers running on server after automatic deployment
- [ ] Health checks passing in workflow
- [ ] Rollback mechanism tested (optional)
- [ ] Firewall rules configured (optional)
- [ ] Backup script created and scheduled (optional)

## Troubleshooting

### SSH Connection Fails

**Problem**: `Permission denied (publickey)` error

**Solution**:
```bash
# Verify SSH key is added to server
ssh -i openclaw_deploy_key deploy@100.105.147.99 "cat ~/.ssh/authorized_keys"

# Verify GitHub secret contains full private key (including BEGIN/END lines)
# Check GitHub Actions logs for SSH errors
```

### Health Check Fails

**Problem**: Container is running but health check fails

**Solution**:
```bash
# SSH to server
ssh deploy@100.105.147.99

# Check container logs
cd ~/openclaw-prd
docker compose logs openclaw-gateway

# Test health endpoint manually
curl -v http://localhost:18789/health

# Check if port is listening
netstat -tlnp | grep 18789
```

### Deployment Fails with "Container not found"

**Problem**: Docker can't find container for rollback tagging

**Solution**: This is expected on first deployment (no previous container exists). The workflow handles this gracefully with `|| echo "none"`.

### Old Images Not Cleaned Up

**Problem**: Disk space running low due to old images

**Solution**:
```bash
# SSH to server
ssh deploy@100.105.147.99

# Manual cleanup
docker system prune -a --volumes

# Check disk usage
docker system df
df -h
```

## References

- **Docker Compose**: https://docs.docker.com/compose/
- **GitHub Actions**: https://docs.github.com/en/actions
- **SSH Agent Action**: https://github.com/webfactory/ssh-agent
- **OpenClaw Repository**: https://github.com/nikolasp98/openclaw
