# OpenClaw Production Deployment - Quick Start Guide

This guide will get you from zero to automatic production deployment in ~30 minutes.

## Prerequisites

- [ ] Root access to a production server (e.g., `root@100.105.147.99`)
- [ ] Docker installed on production server
- [ ] GitHub repository access (ability to add secrets)
- [ ] Local machine with SSH client

## Step 1: Generate SSH Keys (2 minutes)

On your **local machine**:

```bash
cd /path/to/openclaw/scripts/deployment

# Generate deployment SSH keys
./generate-deploy-keys.sh

# This creates:
# - ~/.ssh/openclaw/openclaw_deploy_key (private key - for GitHub)
# - ~/.ssh/openclaw/openclaw_deploy_key.pub (public key - for server)
```

## Step 2: Setup Production Server (5 minutes)

Copy setup script to server:

```bash
# From your local machine
scp scripts/deployment/setup-server.sh root@100.105.147.99:/tmp/

# SSH to server and run setup
ssh root@100.105.147.99

cd /tmp
chmod +x setup-server.sh
./setup-server.sh default ~/.ssh/openclaw/openclaw_deploy_key.pub
```

The setup script will:
- ✅ Create `deploy` user with Docker access
- ✅ Setup SSH access with your public key
- ✅ Create deployment directory structure
- ✅ Generate secure credentials
- ✅ Create template `.env` file

## Step 3: Configure Production Environment (3 minutes)

Still on the **server**:

```bash
# Switch to deploy user
su - deploy

# Edit .env file
nano ~/openclaw-prd/.env

# Update these values (keep the auto-generated OPENCLAW_GATEWAY_TOKEN):
# - CLAUDE_AI_SESSION_KEY=<your-key>
# - CLAUDE_WEB_SESSION_KEY=<your-key>
# - CLAUDE_WEB_COOKIE=<your-cookie>

# Save and exit (Ctrl+X, Y, Enter)
```

## Step 4: Copy docker-compose.yml (1 minute)

From your **local machine**:

```bash
cd /path/to/openclaw

# Copy docker-compose.yml to server
scp docker-compose.yml deploy@100.105.147.99:~/openclaw-prd/
```

## Step 5: Test Manual Deployment (5 minutes)

From your **local machine**:

```bash
# SSH to server as deploy user
ssh -i ~/.ssh/openclaw/openclaw_deploy_key deploy@100.105.147.99

# Navigate to deployment directory
cd ~/openclaw-prd

# Pull images
docker compose pull

# Start services
docker compose up -d

# Wait 15 seconds for startup
sleep 15

# Check status
docker compose ps

# Test health endpoint
curl http://localhost:18789/health

# Check logs (Ctrl+C to exit)
docker compose logs -f openclaw-gateway
```

**Expected output**: Health endpoint should return `200 OK` and containers should be running.

## Step 6: Configure GitHub Secrets (3 minutes)

Go to GitHub repository: `Settings → Secrets and variables → Actions → New repository secret`

Add these secrets:

| Secret Name | Value | How to get |
|-------------|-------|------------|
| `SSH_PRIVATE_KEY` | Contents of `~/.ssh/openclaw/openclaw_deploy_key` | `cat ~/.ssh/openclaw/openclaw_deploy_key` |
| `SSH_HOST` | `100.105.147.99` | Your server IP |
| `SSH_USER` | `deploy` | Fixed value |
| `SSH_PORT` | `22` | Default SSH port |
| `DEPLOYMENT_PATH` | `/home/deploy/openclaw-prd` | Fixed value |

**Important**: Copy the **entire private key** including the `-----BEGIN` and `-----END` lines.

## Step 7: Test Automatic Deployment (5 minutes)

From your **local machine**:

```bash
cd /path/to/openclaw

# Checkout PRD branch (create if doesn't exist)
git checkout PRD || git checkout -b PRD

# Make an empty commit to trigger deployment
git commit --allow-empty -m "test: trigger automatic deployment"

# Push to GitHub
git push origin PRD
```

**Monitor deployment**:

1. Go to GitHub repository → **Actions** tab
2. Watch **"Docker Release"** workflow complete (~5-10 minutes)
3. Watch **"Deploy to Production"** workflow start and complete (~2-3 minutes)
4. Check logs for any errors

## Step 8: Verify Automatic Deployment (2 minutes)

From your **local machine**:

```bash
# SSH to server
ssh -i ~/.ssh/openclaw/openclaw_deploy_key deploy@100.105.147.99

# Check containers are running
docker compose ps

# Check image version (should match latest push)
docker images | grep openclaw

# Test health endpoint
curl http://localhost:18789/health
```

## ✅ Success!

You now have automatic production deployment! Every push to the PRD branch will automatically:
1. Build Docker images
2. Push to GitHub Container Registry
3. Deploy to production server
4. Run health checks
5. Rollback on failure

## Next Steps

### Optional Enhancements

**1. Setup Backups** (5 minutes)

```bash
# Copy backup script to server
scp scripts/deployment/backup-openclaw.sh deploy@100.105.147.99:~/

# SSH to server
ssh deploy@100.105.147.99

# Make executable
chmod +x ~/backup-openclaw.sh

# Test backup
./backup-openclaw.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add line: 0 2 * * * /home/deploy/backup-openclaw.sh
```

**2. Security Hardening** (3 minutes)

```bash
# SSH to server as root
ssh root@100.105.147.99

# Disable password auth for deploy user
cat >> /etc/ssh/sshd_config <<EOF

# Deploy user hardening
Match User deploy
    PasswordAuthentication no
    PubkeyAuthentication yes
EOF

# Restart SSH
systemctl restart sshd

# Configure firewall
ufw allow 22/tcp      # SSH
ufw allow 18789/tcp   # OpenClaw Gateway
ufw allow 18790/tcp   # OpenClaw Bridge
ufw enable
```

**3. Scale to Multi-Tenant** (see full documentation)

When you need to deploy to multiple servers:
- Disable Phase 1 workflow: `mv .github/workflows/deploy-prd.yml .github/workflows/deploy-prd-single.yml.disabled`
- Enable Phase 2 workflow: `mv .github/workflows/deploy-prd-multi.yml .github/workflows/deploy-prd.yml`
- Update server registry: `.github/servers/production.json`
- Push to PRD branch

## Troubleshooting

### SSH connection fails

```bash
# Verify SSH key is correct
ssh-keygen -l -f ~/.ssh/openclaw/openclaw_deploy_key.pub

# Test connection with verbose output
ssh -vvv -i ~/.ssh/openclaw/openclaw_deploy_key deploy@100.105.147.99
```

### Health check fails

```bash
# SSH to server
ssh deploy@100.105.147.99

# Check container logs
cd ~/openclaw-prd
docker compose logs openclaw-gateway

# Check if port is listening
netstat -tlnp | grep 18789

# Restart containers
docker compose down && docker compose up -d
```

### Deployment workflow not triggered

- Verify the PRD branch exists
- Check that Docker Release workflow completed successfully
- Verify GitHub Secrets are set correctly
- Check GitHub Actions logs for errors

## Reference Documentation

- **Full Documentation**: `docs/deployment/auto-deploy-multi-tenant.md`
- **GitHub Workflows**:
  - Phase 1 (Single Server): `.github/workflows/deploy-prd.yml`
  - Phase 2 (Multi-Server): `.github/workflows/deploy-prd-multi.yml`
- **Server Registry**: `.github/servers/production.json`
- **Helper Scripts**: `scripts/deployment/`

## Support

If you encounter issues:
1. Check GitHub Actions logs
2. Check server logs: `docker compose logs`
3. Review troubleshooting section in full documentation
4. Open an issue on GitHub

## Summary

You've successfully implemented automatic production deployment! Here's what you accomplished:

✅ Generated deployment SSH keys
✅ Configured production server with deploy user
✅ Setup deployment directory structure
✅ Tested manual deployment
✅ Configured GitHub Actions secrets
✅ Triggered automatic deployment
✅ Verified deployment success

**Time invested**: ~30 minutes
**Future deployment time**: 0 minutes (fully automatic!)
