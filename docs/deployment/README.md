# OpenClaw Production Deployment Documentation

This directory contains comprehensive documentation for deploying OpenClaw to production environments.

## 📚 Documentation Index

### Quick Start
- **[QUICKSTART.md](QUICKSTART.md)** - Get from zero to production deployment in 30 minutes
  - Prerequisites checklist
  - Step-by-step setup instructions
  - Verification procedures
  - Common troubleshooting

### Full Documentation
- **[auto-deploy-multi-tenant.md](auto-deploy-multi-tenant.md)** - Complete deployment guide
  - Architecture overview (3 phases)
  - Server preparation (detailed)
  - GitHub Actions setup
  - Multi-tenant scaling
  - Monitoring and maintenance
  - Emergency procedures
  - Security hardening

## 🛠️ Deployment Scripts

Located in [`scripts/deployment/`](../../scripts/deployment/):

- **`generate-deploy-keys.sh`** - Generate SSH keys for GitHub Actions
- **`setup-server.sh`** - Prepare production server (run as root)
- **`backup-openclaw.sh`** - Automated backup script for production data

See [scripts/deployment/README.md](../../scripts/deployment/README.md) for detailed usage.

## 🏗️ Deployment Architecture

OpenClaw uses a **phased GitHub Actions-based automatic deployment** system:

### Phase 1: Single Server (Implemented)
- **Status**: ✅ Ready to use
- **Workflow**: `.github/workflows/deploy-prd.yml`
- **Scales to**: 1 server
- **Timeline**: 2-3 hours to implement
- **Best for**: Getting started, single production server

**How it works**:
1. Push to PRD branch triggers Docker Release workflow
2. Builds and pushes multi-arch images to GitHub Container Registry
3. Deploy workflow automatically:
   - Connects to server via SSH
   - Pulls latest images
   - Gracefully restarts containers
   - Runs health checks
   - Automatically rolls back on failure

### Phase 2: Multi-Server with Registry (Prepared)
- **Status**: 🚧 Prepared (disabled by default)
- **Workflow**: `.github/workflows/deploy-prd-multi.yml`
- **Server Registry**: `.github/servers/production.json`
- **Scales to**: 2-20 servers
- **Timeline**: +4-6 hours (incremental from Phase 1)
- **Best for**: Multi-tenant with manual server provisioning

**How it works**:
- JSON-based server registry defines all production servers
- GitHub Actions matrix deploys to all servers in parallel
- Per-tenant isolation (separate containers, configs, credentials)
- Independent health checks and rollbacks per tenant
- Add/remove tenants by updating JSON registry

### Phase 3: Kubernetes Auto-Scaling (Planned)
- **Status**: 📝 Planned
- **Scales to**: Unlimited
- **Timeline**: 1-2 weeks
- **Best for**: 20+ servers, true auto-scaling, high-scale production

**Features**:
- Namespace-per-tenant isolation
- Horizontal Pod Autoscaler (automatic scaling based on CPU/memory)
- GitOps integration (Flux/ArgoCD)
- Load balancing with Ingress Controller
- Self-healing and high availability

## 🚀 Quick Start Paths

### For First-Time Setup (30 minutes)

Follow **[QUICKSTART.md](QUICKSTART.md)** for step-by-step instructions:

1. Generate SSH keys
2. Setup production server
3. Configure environment
4. Test manual deployment
5. Configure GitHub Secrets
6. Test automatic deployment
7. Verify success

### For Adding More Servers (Phase 2)

1. Disable Phase 1: `mv .github/workflows/deploy-prd.yml .github/workflows/deploy-prd-single.yml.disabled`
2. Enable Phase 2: `mv .github/workflows/deploy-prd-multi.yml .github/workflows/deploy-prd.yml`
3. Run server setup on new servers: `./scripts/deployment/setup-server.sh`
4. Update `.github/servers/production.json` with new server entries
5. Push to PRD branch - deployment happens automatically

### For Kubernetes Migration (Phase 3)

See full documentation in [auto-deploy-multi-tenant.md](auto-deploy-multi-tenant.md#phase-3-kubernetes-auto-scaling-advanced).

## 📋 GitHub Workflows

### Existing Workflows
- **`.github/workflows/docker-release.yml`** - Builds and pushes Docker images (already working)
  - Triggers on PRD/DEV branch push
  - Creates multi-arch images (amd64, arm64)
  - Pushes to GitHub Container Registry

### New Workflows (Implemented)
- **`.github/workflows/deploy-prd.yml`** - Single server deployment (Phase 1)
  - Triggers when Docker Release completes on PRD branch
  - Deploys to single production server
  - Includes health checks and automatic rollback

- **`.github/workflows/deploy-prd-multi.yml`** - Multi-server deployment (Phase 2)
  - Same as above, but deploys to multiple servers in parallel
  - Uses server registry for dynamic server management
  - Per-tenant health checks and rollbacks

## 🔐 Security

### SSH Key Management
- Generate keys using `generate-deploy-keys.sh`
- Private key stored in GitHub Secrets (never in repository)
- Public key added to production servers
- Rotate keys quarterly for security

### Server Security
- Deploy user with Docker-only access (no sudo)
- SSH key authentication only (password auth disabled)
- Firewall rules for OpenClaw ports only
- Environment files with restricted permissions

### Credential Management
- Credentials stored in `.env` files (not in git)
- GitHub Secrets for CI/CD access
- Secure token generation for gateway authentication
- Backup files encrypted or restricted permissions

## 📊 Monitoring & Maintenance

### Daily
- Monitor GitHub Actions for deployment failures
- Check server health endpoint: `curl http://SERVER_IP:18789/health`

### Weekly
- Review container logs for errors
- Check disk usage: `docker system df`

### Monthly
- Prune unused images: `docker system prune -a`
- Rotate gateway tokens
- Review SSH access logs

### Quarterly
- Rotate SSH deployment keys
- Update GitHub Secrets
- Review and update `.env` configuration

## 🔄 Backup Strategy

Use `scripts/deployment/backup-openclaw.sh` for automated backups:

- **What it backs up**:
  - Config directory (`~/.openclaw-prd`)
  - Environment file (`.env`)
  - Docker Compose file (`docker-compose.yml`)

- **Retention**: 7 days (configurable)
- **Schedule**: Daily at 2 AM via cron
- **Location**: `/var/backups/openclaw`

## 🆘 Emergency Procedures

### Deployment Fails
1. Check GitHub Actions logs
2. SSH to server: `docker compose ps`
3. Check logs: `docker compose logs`
4. Automatic rollback will occur if health checks fail

### Manual Rollback
```bash
ssh deploy@SERVER_IP
cd ~/openclaw-prd
sed -i 's/:prd/:prd-rollback/g' .env
docker compose down && docker compose up -d
sed -i 's/:prd-rollback/:prd/g' .env
```

### Containers Won't Start
```bash
# Check Docker service
sudo systemctl status docker

# Check disk space
df -h

# Restart Docker
sudo systemctl restart docker
```

## 📖 Reference

### GitHub Repository Files
- **Workflows**: `.github/workflows/deploy-prd*.yml`
- **Server Registry**: `.github/servers/production.json`
- **Docker Compose**: `docker-compose.yml`

### Scripts
- **Deployment Scripts**: `scripts/deployment/`
- **Script Documentation**: `scripts/deployment/README.md`

### Documentation
- **Full Guide**: [auto-deploy-multi-tenant.md](auto-deploy-multi-tenant.md)
- **Quick Start**: [QUICKSTART.md](QUICKSTART.md)
- **This Index**: [README.md](README.md)

## ❓ FAQ

**Q: Which phase should I start with?**
A: Start with Phase 1 (single server) to prove the concept, then scale to Phase 2 when you need multi-tenant support.

**Q: Can I skip Phase 1 and go directly to Phase 2?**
A: Yes, if you're comfortable with server administration and can parallelize server setup. However, Phase 1 helps you test the deployment system with a single server first.

**Q: How do I add a new tenant in Phase 2?**
A: Run `setup-server.sh` on new server, update `.github/servers/production.json`, and push to PRD branch. Deployment happens automatically.

**Q: What if deployment fails?**
A: The workflow includes automatic rollback. If health checks fail, it reverts to the previous image automatically.

**Q: Can I deploy to DEV branch too?**
A: Yes! The Docker Release workflow already builds DEV images. You can create a `deploy-dev.yml` workflow using the same pattern, just change `PRD` to `DEV`.

**Q: How much does this cost?**
- Phase 1: ~$10-50/month for VPS
- Phase 2: ~$10-50/server/month (scales linearly)
- Phase 3: ~$100-500/month for managed Kubernetes

**Q: What if I have multiple regions?**
A: Phase 2 supports regions via the `region` field in server registry. You can filter deployments by region if needed. Phase 3 (Kubernetes) is better for true multi-region.

## 🎯 Decision Tree

```
How many production servers do you need?

├─ 1 server
│  └─ Phase 1 (Single Server)
│     - Timeline: 2-3 hours
│     - Cost: ~$10-50/month
│     - Use: .github/workflows/deploy-prd.yml
│
├─ 2-20 servers
│  └─ Phase 2 (Server Registry)
│     - Timeline: 4-6 hours
│     - Cost: ~$10-50/server/month
│     - Use: .github/workflows/deploy-prd-multi.yml
│     - Registry: .github/servers/production.json
│
└─ 20+ servers (or need auto-scaling)
   └─ Phase 3 (Kubernetes)
      - Timeline: 1-2 weeks
      - Cost: ~$100-500/month
      - Tools: K8s + HPA + GitOps (Flux/ArgoCD)
```

## 🤝 Support

If you encounter issues:
1. Check [Troubleshooting section](QUICKSTART.md#troubleshooting) in QUICKSTART.md
2. Review GitHub Actions logs
3. Check server logs: `docker compose logs`
4. Consult [full documentation](auto-deploy-multi-tenant.md)
5. Open an issue on GitHub

## 📜 License

MIT License - See [LICENSE](../../LICENSE) for details
