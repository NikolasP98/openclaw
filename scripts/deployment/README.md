# OpenClaw Deployment Scripts

This directory contains helper scripts for setting up and managing OpenClaw production deployments.

## Scripts

### 1. `generate-deploy-keys.sh`

Generates SSH key pair for GitHub Actions deployment.

**Usage**:
```bash
./generate-deploy-keys.sh [output-directory]
```

**Example**:
```bash
./generate-deploy-keys.sh ~/.ssh/openclaw
```

**Output**:
- Private key: `~/.ssh/openclaw/openclaw_deploy_key` (add to GitHub Secrets)
- Public key: `~/.ssh/openclaw/openclaw_deploy_key.pub` (add to server)

**When to use**: Once per deployment setup, before configuring GitHub Actions.

---

### 2. `setup-server.sh`

Prepares a production server for automatic deployment. Creates deploy user, sets up SSH access, creates directory structure, and generates secure credentials.

**Usage**:
```bash
# Run on server as root
./setup-server.sh <tenant-name> <public-key-path>
```

**Example**:
```bash
# On local machine, copy script to server
scp setup-server.sh root@100.105.147.99:/tmp/

# SSH to server and run
ssh root@100.105.147.99
cd /tmp
chmod +x setup-server.sh
./setup-server.sh default /tmp/openclaw_deploy_key.pub
```

**What it does**:
1. Creates `deploy` user with Docker access
2. Sets up SSH directory and authorized_keys
3. Adds public key for SSH access
4. Creates deployment directory structure
5. Creates template `.env` file
6. Generates secure gateway token

**When to use**: Once per production server, before first deployment.

---

### 3. `backup-openclaw.sh`

Creates backups of OpenClaw production data (config, .env, docker-compose.yml).

**Usage**:
```bash
./backup-openclaw.sh [tenant-name]
```

**Example**:
```bash
./backup-openclaw.sh acme-corp
```

**Installation on server**:
```bash
# Copy to server
scp backup-openclaw.sh deploy@100.105.147.99:~/

# Make executable
ssh deploy@100.105.147.99 'chmod +x ~/backup-openclaw.sh'

# Test
ssh deploy@100.105.147.99 '~/backup-openclaw.sh'

# Add to crontab (daily at 2 AM)
ssh deploy@100.105.147.99 'crontab -e'
# Add line: 0 2 * * * /home/deploy/backup-openclaw.sh
```

**Configuration**:
- Backup directory: `/var/backups/openclaw`
- Retention period: 7 days (configurable)
- Notifications: Uncomment Discord/Slack webhook sections to enable

**When to use**: Daily via cron job on production servers.

---

## Quick Start Workflow

### First-Time Setup

1. **Generate SSH keys** (local machine):
   ```bash
   ./generate-deploy-keys.sh
   ```

2. **Setup production server** (run as root on server):
   ```bash
   scp setup-server.sh root@SERVER_IP:/tmp/
   scp ~/.ssh/openclaw/openclaw_deploy_key.pub root@SERVER_IP:/tmp/
   ssh root@SERVER_IP
   cd /tmp
   chmod +x setup-server.sh
   ./setup-server.sh default openclaw_deploy_key.pub
   ```

3. **Configure credentials** (on server):
   ```bash
   su - deploy
   nano ~/openclaw-prd/.env
   # Update CLAUDE_AI_SESSION_KEY, CLAUDE_WEB_SESSION_KEY, CLAUDE_WEB_COOKIE
   ```

4. **Copy docker-compose.yml** (local machine):
   ```bash
   scp docker-compose.yml deploy@SERVER_IP:~/openclaw-prd/
   ```

5. **Add GitHub Secrets** (in GitHub repository):
   - `SSH_PRIVATE_KEY`: Contents of `~/.ssh/openclaw/openclaw_deploy_key`
   - `SSH_HOST`: Server IP address
   - `SSH_USER`: `deploy`
   - `SSH_PORT`: `22`
   - `DEPLOYMENT_PATH`: `/home/deploy/openclaw-prd`

6. **Test deployment** (local machine):
   ```bash
   git checkout PRD
   git commit --allow-empty -m "test: trigger deployment"
   git push origin PRD
   ```

### Adding New Tenant/Server

For multi-server deployment (Phase 2):

1. **Generate SSH keys** (if not already done):
   ```bash
   ./generate-deploy-keys.sh
   ```

2. **Setup new server**:
   ```bash
   scp setup-server.sh root@NEW_SERVER_IP:/tmp/
   scp ~/.ssh/openclaw/openclaw_deploy_key.pub root@NEW_SERVER_IP:/tmp/
   ssh root@NEW_SERVER_IP
   cd /tmp
   chmod +x setup-server.sh
   ./setup-server.sh newtenant openclaw_deploy_key.pub
   ```

3. **Configure tenant-specific credentials** (on new server):
   ```bash
   su - deploy
   nano ~/openclaw-prd-newtenant/.env
   # Update credentials
   ```

4. **Update server registry** (local machine):
   ```bash
   # Edit .github/servers/production.json
   # Add new server entry
   git add .github/servers/production.json
   git commit -m "feat: add newtenant server"
   git push origin PRD
   ```

Deployment happens automatically to all servers.

## Maintenance Scripts

### Manual Deployment Test

```bash
ssh deploy@SERVER_IP << 'EOF'
cd ~/openclaw-prd
docker compose pull
docker compose down
docker compose up -d
sleep 15
docker compose ps
curl http://localhost:18789/health
EOF
```

### Manual Rollback

```bash
ssh deploy@SERVER_IP << 'EOF'
cd ~/openclaw-prd
sed -i 's/:prd/:prd-rollback/g' .env
docker compose down
docker compose up -d
sed -i 's/:prd-rollback/:prd/g' .env
EOF
```

### Check Deployment Status

```bash
ssh deploy@SERVER_IP << 'EOF'
cd ~/openclaw-prd
docker compose ps
docker images | grep openclaw
docker compose logs --tail=50 openclaw-gateway
EOF
```

### Cleanup Old Images

```bash
ssh deploy@SERVER_IP << 'EOF'
docker image prune -f
docker images ghcr.io/nikolasp98/openclaw --format "{{.ID}} {{.CreatedAt}}" | \
  tail -n +4 | \
  awk '{print $1}' | \
  xargs -r docker rmi 2>/dev/null || true
EOF
```

## Troubleshooting

### Script Errors

**Error**: `Permission denied (publickey)`
- **Solution**: Verify public key was added to server correctly
  ```bash
  ssh deploy@SERVER_IP "cat ~/.ssh/authorized_keys"
  ```

**Error**: `deploy user already exists`
- **Solution**: This is expected if re-running setup script. It will skip user creation.

**Error**: `docker: command not found`
- **Solution**: Install Docker on production server first
  ```bash
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  ```

### Backup Script Issues

**Error**: `/var/backups/openclaw: Permission denied`
- **Solution**: Create backup directory as root or change BACKUP_DIR in script
  ```bash
  sudo mkdir -p /var/backups/openclaw
  sudo chown deploy:deploy /var/backups/openclaw
  ```

**Issue**: Backups consuming too much disk space
- **Solution**: Reduce RETENTION_DAYS in backup script or change backup location

## Security Notes

- **Private keys**: Never commit private keys to git. Keep `openclaw_deploy_key` secure.
- **SSH keys**: Rotate deployment keys quarterly for security.
- **Server access**: Use SSH keys only, disable password authentication for deploy user.
- **Credentials**: Store credentials in `.env` files (not in git). Use GitHub Secrets for CI/CD.
- **Backups**: Backup `.env` files contain secrets - ensure `/var/backups/openclaw` has restricted permissions.

## Reference

- **Full Documentation**: `../../docs/deployment/auto-deploy-multi-tenant.md`
- **Quick Start Guide**: `../../docs/deployment/QUICKSTART.md`
- **GitHub Workflows**: `../../.github/workflows/deploy-prd*.yml`
- **Server Registry**: `../../.github/servers/production.json`
