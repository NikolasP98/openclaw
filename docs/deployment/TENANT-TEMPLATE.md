# Tenant: [Tenant Name]

> **Template Instructions:** Copy this file and fill in the details for each tenant. Save as `TENANT-[name].md`.

## Overview

- **Tenant ID**: `[tenant-id]`
- **Tenant Name**: [Human-Readable Name]
- **Region**: [us-east, eu-west, ap-south, etc.]
- **Setup Date**: YYYY-MM-DD
- **Contact**: [name@company.com]
- **Status**: 🟢 Active / 🟡 Testing / 🔴 Inactive

---

## Server Details

### Infrastructure

- **Server IP**: `XXX.XXX.XXX.XXX`
- **SSH Port**: `22` (or custom)
- **SSH Key**: `~/.ssh/openclaw/openclaw_deploy_key`
- **Provider**: [DigitalOcean, AWS, GCP, etc.]
- **Instance Type**: [e.g., Droplet 2GB RAM]

### Resources

- **CPU**: [e.g., 2 vCPUs]
- **RAM**: [e.g., 2GB]
- **Disk**: [e.g., 50GB SSD]
- **Bandwidth**: [e.g., 2TB transfer]

### Network

- **Gateway Port**: `18789`
- **Bridge Port**: `18790`
- **Public Access**: Yes / No / Via VPN
- **Firewall**: [Configured / Not configured]

---

## Deployment Configuration

### Paths

- **Deployment Directory**: `/home/deploy/openclaw-prd-[tenant-id]`
- **Config Directory**: `/home/deploy/.openclaw-prd-[tenant-id]`
- **Data Directories**:
  - Workspace: `/home/deploy/.openclaw-prd-[tenant-id]/workspace`
  - Agents: `/home/deploy/.openclaw-prd-[tenant-id]/agents`
  - Memory: `/home/deploy/.openclaw-prd-[tenant-id]/memory`
  - Sessions: `/home/deploy/.openclaw-prd-[tenant-id]/sessions`

### Containers

- **Gateway Container**: `[tenant-id]_openclaw_gw`
- **CLI Container**: `[tenant-id]_openclaw_cli`
- **Docker Image**: `ghcr.io/nikolasp98/openclaw:prd`

### Server Registry Entry

```json
{
  "id": "prd-tenant-[tenant-id]",
  "host": "XXX.XXX.XXX.XXX",
  "user": "deploy",
  "port": 22,
  "deployment_path": "/home/deploy/openclaw-prd-[tenant-id]",
  "container_prefix": "[tenant-id]",
  "gateway_port": 18789,
  "bridge_port": 18790,
  "tenant": "[Human-Readable Name]",
  "region": "[region]"
}
```

---

## Credentials

### Storage Location

- **Server**: All credentials stored in `/home/deploy/openclaw-prd-[tenant-id]/.env`
- **Local Backup**: [Optional: where credentials are backed up locally]
- **Password Manager**: [Optional: 1Password, LastPass, etc.]

### Required Credentials

| Credential | Status | Last Updated | Notes |
|------------|--------|--------------|-------|
| `OPENCLAW_GATEWAY_TOKEN` | ✅ Set | YYYY-MM-DD | Auto-generated during setup |
| `CLAUDE_AI_SESSION_KEY` | ✅ Set | YYYY-MM-DD | Provided by tenant |
| `CLAUDE_WEB_SESSION_KEY` | ✅ Set | YYYY-MM-DD | Provided by tenant |
| `CLAUDE_WEB_COOKIE` | ✅ Set | YYYY-MM-DD | Provided by tenant |

### Credential Rotation Schedule

- **Gateway Token**: Rotate every 3 months
- **Claude Keys**: As needed / when tenant requests
- **Last Rotation**: YYYY-MM-DD
- **Next Rotation**: YYYY-MM-DD

---

## Access Information

### SSH Access

```bash
# Connect to server
ssh -i ~/.ssh/openclaw/openclaw_deploy_key deploy@XXX.XXX.XXX.XXX

# Navigate to deployment
cd ~/openclaw-prd-[tenant-id]

# View logs
docker compose logs -f openclaw-gateway
```

### Health Endpoints

- **Internal**: `http://localhost:18789/health`
- **External**: `http://XXX.XXX.XXX.XXX:18789/health` (if publicly accessible)
- **VPN/Tailscale**: [if using private network]

### Monitoring

- **Uptime Monitor**: [URL to monitoring dashboard]
- **Alerts**: [Who receives alerts]
- **Log Aggregation**: [If using external logging service]

---

## Deployment History

### Initial Setup

- **Date**: YYYY-MM-DD
- **By**: [Your name]
- **Version**: [OpenClaw version]
- **Notes**: Initial tenant setup and configuration

### Updates

| Date | Version | Deployed By | Notes |
|------|---------|-------------|-------|
| YYYY-MM-DD | v1.0.0 | GitHub Actions | Initial deployment |
| YYYY-MM-DD | v1.1.0 | GitHub Actions | Feature update |
| YYYY-MM-DD | v1.2.0 | GitHub Actions | Bug fixes |

### Incidents

| Date | Issue | Resolution | Downtime |
|------|-------|------------|----------|
| YYYY-MM-DD | [Description] | [How it was fixed] | X minutes |

---

## Maintenance

### Regular Tasks

- [ ] **Weekly**: Check container health and logs
- [ ] **Monthly**: Review disk usage and clean old images
- [ ] **Quarterly**: Rotate gateway token
- [ ] **Annually**: Review and update credentials

### Backup Strategy

- **Data Backed Up**: [Workspace, configs, etc.]
- **Backup Frequency**: [Daily, weekly, etc.]
- **Backup Location**: [Where backups are stored]
- **Last Backup**: YYYY-MM-DD
- **Restore Tested**: Yes / No / Last tested: YYYY-MM-DD

### Update Procedure

1. Changes pushed to PRD branch
2. GitHub Actions builds and deploys automatically
3. Health checks verify deployment success
4. Automatic rollback on failure

---

## Tenant-Specific Configuration

### Special Requirements

- [Any unique configurations for this tenant]
- [Custom environment variables]
- [Special firewall rules]
- [Integration with other services]

### Usage Patterns

- **Peak Hours**: [When tenant is most active]
- **Average Load**: [Requests per day/hour]
- **Resource Usage**: [Typical CPU/RAM usage]

### SLA / Requirements

- **Uptime Target**: [e.g., 99.9%]
- **Response Time**: [e.g., < 500ms]
- **Support Level**: [Standard / Priority / Enterprise]

---

## Troubleshooting

### Common Issues

**Issue 1: [Description]**
- **Symptoms**: [What you see]
- **Cause**: [Why it happens]
- **Solution**: [How to fix]

**Issue 2: [Description]**
- **Symptoms**: [What you see]
- **Cause**: [Why it happens]
- **Solution**: [How to fix]

### Emergency Contacts

- **Primary Contact**: [name@company.com]
- **Secondary Contact**: [name@company.com]
- **Escalation**: [name@company.com]
- **On-Call**: [Schedule or rotation]

### Quick Recovery Commands

```bash
# Restart containers
ssh -i ~/.ssh/openclaw/openclaw_deploy_key deploy@XXX.XXX.XXX.XXX
cd ~/openclaw-prd-[tenant-id]
docker compose restart

# View recent logs
docker compose logs --tail=100 openclaw-gateway

# Force pull and restart (if update failed)
docker compose pull
docker compose down
docker compose up -d

# Check container status
docker compose ps

# Test health endpoint
curl http://localhost:18789/health
```

---

## Notes

### Special Considerations

[Any additional notes about this tenant]

### Future Plans

- [ ] [Planned upgrades]
- [ ] [Feature requests]
- [ ] [Infrastructure changes]

---

**Document Version**: 1.0
**Last Updated**: YYYY-MM-DD
**Maintained By**: [Your name/team]
