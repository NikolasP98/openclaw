# Automatic Deployment Quick Reference

## Phase 1: Single Server

### Setup (One-Time)
```bash
# 1. Run setup script
cd scripts/deployment
./setup-server.sh 100.105.147.99 22

# 2. Configure .env on server
ssh -i ~/.ssh/openclaw/openclaw_deploy_key deploy@100.105.147.99
nano ~/openclaw-prd/.env  # Add Claude credentials

# 3. Test manual deployment
cd ~/openclaw-prd
docker compose pull && docker compose up -d

# 4. Add 5 GitHub Secrets:
# SSH_PRIVATE_KEY, SSH_HOST, SSH_USER, SSH_PORT, DEPLOYMENT_PATH
```

### Deploy
```bash
git checkout PRD
git push origin PRD  # Triggers automatic deployment
```

---

## Phase 2: Multi-Server

### Adding a Server
```bash
# 1. Setup server
./setup-server.sh <server-ip> 22

# 2. Add to .github/servers/production.json
{
  "id": "prd-tenant-<name>",
  "host": "<server-ip>",
  "deployment_path": "/home/deploy/openclaw-prd-<name>",
  "container_prefix": "<name>",
  "tenant": "<name>",
  ...
}

# 3. Configure .env on server

# 4. Deploy
git add .github/servers/production.json
git commit -m "feat: add tenant <name>"
git push origin PRD
```

### Removing a Server
```bash
# 1. Remove from production.json
git add .github/servers/production.json
git commit -m "feat: remove tenant <name>"
git push origin PRD

# 2. Stop containers on server
ssh deploy@<server-ip>
cd ~/openclaw-prd-<name>
docker compose down
```

---

## Common Commands

### Server Management
```bash
# SSH to server
ssh -i ~/.ssh/openclaw/openclaw_deploy_key deploy@<server-ip>

# Check containers
docker compose ps
docker compose logs -f openclaw-gateway

# Restart containers
docker compose restart

# Pull latest image manually
docker compose pull && docker compose up -d
```

### Health Checks
```bash
# From server
curl http://localhost:18789/health

# From outside (if exposed)
curl http://<server-ip>:18789/health
```

### Manual Rollback
```bash
ssh deploy@<server-ip>
cd ~/openclaw-prd
sed -i 's/:prd/:prd-rollback/g' .env
docker compose down && docker compose up -d
```

### Cleanup
```bash
# Remove old images
docker image prune -f

# Full cleanup (careful!)
docker system prune -a --volumes
```

---

## GitHub Secrets (Required)

| Secret | Example Value |
|--------|---------------|
| `SSH_PRIVATE_KEY` | Contents of `~/.ssh/openclaw/openclaw_deploy_key` |
| `SSH_HOST` | `100.105.147.99` |
| `SSH_USER` | `deploy` |
| `SSH_PORT` | `22` |
| `DEPLOYMENT_PATH` | `/home/deploy/openclaw-prd` |

---

## Files

### Workflows
- `.github/workflows/docker-release.yml` - Build images
- `.github/workflows/deploy-prd.yml` - Single server deployment
- `.github/workflows/deploy-prd-multi.yml` - Multi-server deployment

### Configuration
- `.github/servers/production.json` - Server registry (Phase 2)
- `docker-compose.yml` - Container orchestration

### Scripts
- `scripts/deployment/setup-server.sh` - Server setup automation
- `scripts/deployment/backup-openclaw.sh` - Backup script

### Documentation
- `docs/deployment/AUTO-DEPLOY-SETUP.md` - Full setup guide
- `docs/deployment/QUICK-REFERENCE.md` - This file

---

## Troubleshooting

**Deployment fails**: Check GitHub Actions logs
**SSH fails**: Verify SSH_PRIVATE_KEY in GitHub Secrets
**Health check fails**: Check container logs on server
**Out of disk space**: Run `docker system prune -a`

See `AUTO-DEPLOY-SETUP.md` for detailed troubleshooting.
