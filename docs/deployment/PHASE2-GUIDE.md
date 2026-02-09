# Phase 2: Multi-Server Deployment Guide

## Overview

This guide walks you through deploying OpenClaw to multiple servers with full tenant isolation. Each tenant gets:
- Isolated Docker containers with unique names
- Separate configuration files and credentials
- Isolated data directories (workspace, agents, memory, etc.)
- Independent deployment paths

**Current State:**
- ✅ Single-server deployment working (Phase 1)
- ✅ SSH key configured at `~/.ssh/openclaw/openclaw_deploy_key`
- ✅ Multi-server workflow ready to activate

**What You'll Achieve:**
- Deploy to 2-20 servers in parallel
- Add new tenants in 15-20 minutes
- Full tenant isolation (containers, configs, data)
- Automatic deployment via GitHub Actions

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Adding Your First Additional Server](#adding-your-first-additional-server)
   - [Step 1: Plan Your Tenant Configuration](#step-1-plan-your-tenant-configuration)
   - [Step 2: Run Setup Script on New Server](#step-2-run-setup-script-on-new-server)
   - [Step 3: Configure Tenant Environment File](#step-3-configure-tenant-environment-file)
   - [Step 4: Test Manual Deployment](#step-4-test-manual-deployment)
   - [Step 5: Add Tenant to Server Registry](#step-5-add-tenant-to-server-registry)
   - [Step 6: Activate Multi-Server Workflow](#step-6-activate-multi-server-workflow)
   - [Step 7: Commit and Push to Trigger Deployment](#step-7-commit-and-push-to-trigger-deployment)
   - [Step 8: Monitor Deployment in GitHub Actions](#step-8-monitor-deployment-in-github-actions)
   - [Step 9: Verify Deployment on Both Servers](#step-9-verify-deployment-on-both-servers)
3. [Adding Subsequent Servers (Quick Reference)](#adding-subsequent-servers-quick-reference)
4. [Troubleshooting](#troubleshooting)
5. [Rollback Procedures](#rollback-procedures)

---

## Prerequisites

Before starting, ensure you have:

✅ **SSH Key Setup:**
- SSH key exists at: `~/.ssh/openclaw/openclaw_deploy_key`
- Public key added to GitHub Secrets as `SSH_PRIVATE_KEY`
- Key works with existing server

✅ **Phase 1 Complete:**
- Single server deploying successfully
- Docker Release workflow working
- Understand basic deployment process

✅ **New Server Requirements:**
- Ubuntu 20.04+ or Debian 11+
- Docker 20.10+ installed
- Docker Compose v2+ installed
- Minimum 2GB RAM, 20GB disk space
- Ports 18789 (gateway) and 18790 (bridge) available
- Root SSH access for initial setup

---

## Adding Your First Additional Server

### Step 1: Plan Your Tenant Configuration

**1.1 Choose a tenant identifier**

Requirements:
- Lowercase only
- Alphanumeric + hyphens
- No spaces, underscores, or special characters

✅ **Good examples:**
```
acme
widgets-inc
startup-xyz
client-abc
```

❌ **Bad examples:**
```
ACME              # uppercase
Widgets Inc       # spaces
startup_xyz       # underscores
client@123        # special chars
```

**1.2 Gather server information**

You'll need:
- **Server IP address**: e.g., `100.105.148.100`
- **SSH port**: Usually `22`
- **Region identifier**: e.g., `us-east`, `eu-west`, `ap-south`
- **Gateway port**: `18789` (default)
- **Bridge port**: `18790` (default)

**1.3 Document your plan**

Create a planning document:
```
Tenant: acme
Server IP: 100.105.148.100
SSH Port: 22
Region: us-east
Gateway Port: 18789
Bridge Port: 18790
Contact: john@acme.com
```

**Why same ports on all servers?**

Each server runs one tenant, so there are no port conflicts. Tenant isolation comes from:
- Different deployment paths: `/home/deploy/openclaw-prd-{tenant}`
- Different container names: `{tenant}_openclaw_gw`
- Different config directories: `~/.openclaw-prd-{tenant}`

---

### Step 2: Run Setup Script on New Server

**2.1 Navigate to deployment scripts**

```bash
cd /path/to/openclaw/scripts/deployment
```

**2.2 Make script executable** (if not already)

```bash
chmod +x setup-server.sh
```

**2.3 Run the setup script**

**Command format:**
```bash
./setup-server.sh <server-ip> [ssh-port] [--tenant <tenant-name>]
```

**Example for ACME tenant:**
```bash
./setup-server.sh 100.105.148.100 22 --tenant acme
```

**What the script does:**

1. ✅ Checks for SSH key at `~/.ssh/openclaw/openclaw_deploy_key`
2. ✅ Creates `deploy` user on server (if doesn't exist)
3. ✅ Adds deploy user to docker group
4. ✅ Copies SSH public key to server
5. ✅ Tests SSH connection
6. ✅ Creates tenant-specific directories:
   - `/home/deploy/openclaw-prd-acme/` (deployment files)
   - `/home/deploy/.openclaw-prd-acme/` (config data)
7. ✅ Creates tenant-specific `.env` file with:
   - Container names: `acme_openclaw_gw`, `acme_openclaw_cli`
   - Paths: `/home/deploy/.openclaw-prd-acme/`
   - Placeholder credentials (you'll fill in next)
8. ✅ Generates secure `OPENCLAW_GATEWAY_TOKEN`
9. ✅ Copies `docker-compose.yml` to deployment directory

**Expected output:**

```
=== OpenClaw Production Server Setup ===
Server: 100.105.148.100:22
Deploy user: deploy
Tenant: acme
Deployment directory: /home/deploy/openclaw-prd-acme

✓ Using existing SSH key: /home/you/.ssh/openclaw/openclaw_deploy_key

Step 1/7: Creating deploy user...
✓ Deploy user configured

Step 2/7: Setting up SSH keys...
✓ SSH key authorized

Step 3/7: Testing SSH connection...
✓ SSH connection verified

Step 4/7: Creating tenant-specific directories...
✓ Directories created:
  - /home/deploy/openclaw-prd-acme/
  - /home/deploy/.openclaw-prd-acme/

Step 5/7: Creating tenant .env template...
✓ .env template created

Step 6/7: Generating secure gateway token...
✓ Gateway token generated

Step 7/7: Copying docker-compose.yml...
✓ docker-compose.yml copied

=== Server Setup Complete ===

Next steps:
1. SSH to server
2. Navigate to: cd ~/openclaw-prd-acme
3. Edit .env file: nano .env
4. Add Claude credentials
5. Test manual deployment: docker compose pull && docker compose up -d
6. Add tenant to server registry
7. Push to PRD branch to trigger automatic deployment
```

**Common errors and solutions:**

| Error | Solution |
|-------|----------|
| "Permission denied" | Check root SSH access to server |
| "Deploy user exists" | OK, script will skip user creation |
| "Docker not found" | Install Docker on server first |
| "SSH key not found" | Script will generate new key (or check path) |

---

### Step 3: Configure Tenant Environment File

**3.1 SSH to the new server**

```bash
ssh -i ~/.ssh/openclaw/openclaw_deploy_key deploy@100.105.148.100
```

**3.2 Navigate to tenant directory**

```bash
cd ~/openclaw-prd-acme
```

**3.3 List files to verify setup**

```bash
ls -la
```

Expected output:
```
-rw-r--r-- 1 deploy deploy  1234 Feb  9 10:00 .env
-rw-r--r-- 1 deploy deploy  5678 Feb  9 10:00 docker-compose.yml
```

**3.4 View the .env template**

```bash
cat .env
```

You'll see:
```bash
# Docker Configuration
OPENCLAW_IMAGE=ghcr.io/nikolasp98/openclaw:prd
OPENCLAW_GATEWAY_CONTAINER_NAME=acme_openclaw_gw
OPENCLAW_CLI_CONTAINER_NAME=acme_openclaw_cli
OPENCLAW_ENV=PRD

# Paths
OPENCLAW_CONFIG_DIR=/home/deploy/.openclaw-prd-acme
OPENCLAW_WORKSPACE_DIR=/home/deploy/.openclaw-prd-acme/workspace
OPENCLAW_GOG_CONFIG_DIR=/home/deploy/.config/gogcli

# Network Configuration
OPENCLAW_GATEWAY_PORT=18789
OPENCLAW_BRIDGE_PORT=18790
OPENCLAW_GATEWAY_BIND=lan

# Authentication
OPENCLAW_GATEWAY_TOKEN=<auto-generated-token>
CLAUDE_AI_SESSION_KEY=REPLACE_WITH_YOUR_KEY
CLAUDE_WEB_SESSION_KEY=REPLACE_WITH_YOUR_KEY
CLAUDE_WEB_COOKIE=REPLACE_WITH_YOUR_COOKIE

# Optional: Browser support
OPENCLAW_DOCKER_APT_PACKAGES=chromium fonts-liberation fonts-noto-color-emoji

# Tailscale (if using)
TAILSCALE_SOCKET=/var/run/tailscale/tailscaled.sock
TAILSCALE_BINARY=/usr/bin/tailscale
```

**3.5 Edit the .env file**

```bash
nano .env
```

**3.6 Update ONLY the Claude credentials**

The `OPENCLAW_GATEWAY_TOKEN` is already set. Update these lines:

```bash
CLAUDE_AI_SESSION_KEY=sk-ant-acme-actual-key-here
CLAUDE_WEB_SESSION_KEY=acme-web-session-key-here
CLAUDE_WEB_COOKIE=sessionKey=acme-cookie-value-here
```

**Where to get credentials:**
- Provided by the tenant
- From Claude dashboard or authentication setup
- **Never share credentials between tenants!**

**3.7 Verify container names and paths**

Scroll through `.env` and check:

```bash
# Container names should have tenant prefix
OPENCLAW_GATEWAY_CONTAINER_NAME=acme_openclaw_gw     # ✅ Has 'acme' prefix
OPENCLAW_CLI_CONTAINER_NAME=acme_openclaw_cli         # ✅ Has 'acme' prefix

# Paths should have tenant in them
OPENCLAW_CONFIG_DIR=/home/deploy/.openclaw-prd-acme  # ✅ Has 'acme' in path
```

**3.8 Save and exit**

- Press `Ctrl + O` to save
- Press `Enter` to confirm
- Press `Ctrl + X` to exit

**3.9 Verify .env was saved**

```bash
cat .env | grep CLAUDE_AI_SESSION_KEY
```

Should show your actual key, not "REPLACE_WITH_YOUR_KEY".

---

### Step 4: Test Manual Deployment

**4.1 Ensure you're in the tenant directory**

```bash
cd ~/openclaw-prd-acme
pwd  # Should show: /home/deploy/openclaw-prd-acme
```

**4.2 Pull Docker images**

```bash
docker compose pull
```

Expected output:
```
[+] Pulling 2/2
 ✔ openclaw-gateway Pulled                                    15.2s
 ✔ openclaw-cli Pulled                                        15.2s
```

**If you see errors:**
- "permission denied" → Deploy user not in docker group
  ```bash
  sudo usermod -aG docker deploy
  newgrp docker
  ```
- "registry not found" → Check internet connectivity
- "authentication required" → Check GHCR access

**4.3 Start containers**

```bash
docker compose up -d
```

Expected output:
```
[+] Running 2/2
 ✔ Container acme_openclaw_gw   Started                      2.1s
 ✔ Container acme_openclaw_cli  Started                      2.3s
```

**4.4 Verify containers are running**

```bash
docker compose ps
```

Expected output:
```
NAME                IMAGE                              STATUS
acme_openclaw_gw    ghcr.io/nikolasp98/openclaw:prd    Up 30 seconds
acme_openclaw_cli   ghcr.io/nikolasp98/openclaw:prd    Up 30 seconds
```

**If status shows "Exited" or "Restarting":**
- Check logs: `docker compose logs openclaw-gateway`
- Common issues: wrong credentials, missing environment variables

**4.5 Check gateway logs**

```bash
docker compose logs openclaw-gateway
```

**Look for success indicators:**
```
✓ Gateway started successfully
✓ Listening on 0.0.0.0:18789
✓ Health check endpoint available at /health
```

**If you see errors:**
```
✗ Failed to authenticate with Claude API
✗ Invalid CLAUDE_AI_SESSION_KEY
```

Fix credentials in `.env`, then:
```bash
docker compose down
docker compose up -d
```

**4.6 Test health endpoint**

```bash
curl http://localhost:18789/health
```

Expected response:
```json
{"status":"ok","timestamp":"2026-02-09T12:00:00Z"}
```

**If curl is not installed:**
```bash
sudo apt-get update && sudo apt-get install curl -y
```

**If you get "Connection refused":**
- Container not running: `docker compose ps`
- Wrong port: `cat .env | grep GATEWAY_PORT`
- Firewall: `sudo ufw status`

**4.7 Stop containers (optional)**

```bash
docker compose down
```

Or leave them running (automated deployment will restart them).

**4.8 Exit the server**

```bash
exit  # Back to your local machine
```

---

### Step 5: Add Tenant to Server Registry

**5.1 Navigate to repository**

```bash
cd /path/to/openclaw
```

**5.2 Open the server registry**

```bash
nano .github/servers/production.json
```

Or use your preferred editor:
```bash
code .github/servers/production.json  # VS Code
vim .github/servers/production.json   # Vim
```

**5.3 Current content (Phase 1)**

```json
{
  "servers": [
    {
      "id": "prd-tenant-primary",
      "host": "100.105.147.99",
      "user": "deploy",
      "port": 22,
      "deployment_path": "/home/deploy/openclaw-prd",
      "container_prefix": "openclaw_PRD",
      "gateway_port": 18789,
      "bridge_port": 18790,
      "tenant": "primary",
      "region": "us-east"
    }
  ]
}
```

**5.4 Add ACME tenant entry**

Add a comma after the first server's closing `}`, then add:

```json
{
  "servers": [
    {
      "id": "prd-tenant-primary",
      "host": "100.105.147.99",
      "user": "deploy",
      "port": 22,
      "deployment_path": "/home/deploy/openclaw-prd",
      "container_prefix": "openclaw_PRD",
      "gateway_port": 18789,
      "bridge_port": 18790,
      "tenant": "primary",
      "region": "us-east"
    },
    {
      "id": "prd-tenant-acme",
      "host": "100.105.148.100",
      "user": "deploy",
      "port": 22,
      "deployment_path": "/home/deploy/openclaw-prd-acme",
      "container_prefix": "acme",
      "gateway_port": 18789,
      "bridge_port": 18790,
      "tenant": "acme-corp",
      "region": "us-east"
    }
  ]
}
```

**5.5 Field explanations**

| Field | Value | Explanation |
|-------|-------|-------------|
| `id` | `"prd-tenant-acme"` | Unique identifier for GitHub Actions |
| `host` | `"100.105.148.100"` | Server IP address |
| `user` | `"deploy"` | SSH username (always "deploy") |
| `port` | `22` | SSH port |
| `deployment_path` | `"/home/deploy/openclaw-prd-acme"` | Where docker-compose.yml and .env are located |
| `container_prefix` | `"acme"` | Prefix for container names |
| `gateway_port` | `18789` | Gateway port (same across servers) |
| `bridge_port` | `18790` | Bridge port (same across servers) |
| `tenant` | `"acme-corp"` | Human-readable tenant name |
| `region` | `"us-east"` | Server region |

**5.6 Save and exit**

- Nano: `Ctrl + O`, `Enter`, `Ctrl + X`
- VS Code: `Ctrl + S`
- Vim: `:wq`

**5.7 Validate JSON syntax**

```bash
cat .github/servers/production.json | jq .
```

**Expected:** Pretty-printed JSON

**If you see "parse error":**
- Missing comma between objects
- Extra comma after last object
- Mismatched brackets/braces

**Install jq if needed:**
```bash
# Ubuntu/Debian
sudo apt-get install jq

# Mac
brew install jq
```

---

### Step 6: Activate Multi-Server Workflow

**6.1 Check current workflows**

```bash
ls -la .github/workflows/ | grep deploy
```

You should see:
```
deploy-prd.yml          # Single-server (currently active)
deploy-prd-multi.yml    # Multi-server (need to activate)
```

**6.2 Disable single-server workflow**

```bash
mv .github/workflows/deploy-prd.yml .github/workflows/deploy-prd-single.yml.disabled
```

**6.3 Activate multi-server workflow**

```bash
mv .github/workflows/deploy-prd-multi.yml .github/workflows/deploy-prd.yml
```

**6.4 Verify the active workflow**

```bash
head -20 .github/workflows/deploy-prd.yml
```

Should show:
```yaml
name: Deploy to Production (Multi-Server)

on:
  workflow_run:
    workflows: ["Docker Release"]
    ...
```

If it says "Deploy to Production" (not "Multi-Server"), you renamed the wrong file.

**6.5 Verify disabled workflow**

```bash
ls .github/workflows/ | grep disabled
```

Should show:
```
deploy-prd-single.yml.disabled
```

---

### Step 7: Commit and Push to Trigger Deployment

**7.1 Check what changed**

```bash
git status
```

Should show:
```
Changes not staged for commit:
  modified:   .github/servers/production.json
  renamed:    .github/workflows/deploy-prd.yml -> .github/workflows/deploy-prd-single.yml.disabled
  renamed:    .github/workflows/deploy-prd-multi.yml -> .github/workflows/deploy-prd.yml
```

**7.2 Review changes**

```bash
git diff .github/servers/production.json
```

Verify ACME tenant entry is correct.

**7.3 Stage all changes**

```bash
git add .github/servers/production.json
git add .github/workflows/deploy-prd.yml
git add .github/workflows/deploy-prd-single.yml.disabled
```

**7.4 Commit with descriptive message**

```bash
git commit -m "feat: add acme tenant and activate multi-server deployment

- Add acme tenant (100.105.148.100) to production registry
- Activate multi-server workflow for parallel deployments
- Disable single-server workflow
- Deploys to primary + acme servers in parallel"
```

**7.5 Push to DEV branch first** (recommended)

```bash
git checkout DEV
git push origin DEV
```

**7.6 Merge to PRD branch**

```bash
git checkout PRD
git merge DEV
```

**7.7 Push to PRD to trigger deployment**

```bash
git push origin PRD
```

**This triggers:**
1. ✅ Docker Release workflow (builds images)
2. ✅ Deploy to Production (Multi-Server) workflow

---

### Step 8: Monitor Deployment in GitHub Actions

**8.1 Open GitHub repository**

```
https://github.com/nikolasp98/openclaw
```

**8.2 Navigate to Actions tab**

Click "Actions" in top menu.

**8.3 Find running workflows**

You should see:

1. **Docker Release**
   - Status: 🟡 Running or ✅ Complete
   - Duration: ~10-15 minutes

2. **Deploy to Production (Multi-Server)**
   - Status: 🟡 Running
   - Duration: ~5-10 minutes

**8.4 Watch parallel deployments**

Click on "Deploy to Production (Multi-Server)":

```
📋 Load server registry ✅ Complete
📊 Deploy to prd-tenant-primary 🟡 Running
📊 Deploy to prd-tenant-acme 🟡 Running
📈 Deployment Summary (waiting)
```

**8.5 Monitor deployment progress**

Each job shows:
```
=== Starting deployment ===
Tagging current image for rollback
Pulling latest image...
✓ Image pulled
Stopping containers...
Starting new containers...
✓ Containers started
=== Deployment complete ===
```

Then health check:
```
Container is running. Testing health endpoint...
✅ Health check passed
```

**8.6 Check for errors**

If deployment fails:
- ❌ Red X appears
- Click job to see error logs
- Common errors:
  - SSH connection failed → Check SSH_PRIVATE_KEY secret
  - Health check failed → Check container logs on server
  - docker-compose.yml not found → Check deployment_path

**8.7 View deployment summary**

After all deployments complete:

```
## 🚀 Multi-Server Deployment Summary

📊 **Total servers**: 2
✅ **Status**: All deployments successful

### Server Details
- **primary** (us-east): 100.105.147.99
- **acme-corp** (us-east): 100.105.148.100
```

**8.8 Verify final status**

All jobs should show ✅ green checkmarks:
- ✅ Load server registry
- ✅ Deploy to prd-tenant-primary
- ✅ Deploy to prd-tenant-acme
- ✅ Deployment Summary

---

### Step 9: Verify Deployment on Both Servers

**9.1 Verify PRIMARY server**

```bash
ssh -i ~/.ssh/openclaw/openclaw_deploy_key deploy@100.105.147.99
cd ~/openclaw-prd
docker compose ps
```

Expected:
```
NAME                  STATUS
openclaw_PRD_gw       Up 5 minutes
openclaw_PRD_cli      Up 5 minutes
```

```bash
curl http://localhost:18789/health
exit
```

**9.2 Verify ACME server**

```bash
ssh -i ~/.ssh/openclaw/openclaw_deploy_key deploy@100.105.148.100
cd ~/openclaw-prd-acme
docker compose ps
```

Expected:
```
NAME                STATUS
acme_openclaw_gw    Up 5 minutes
acme_openclaw_cli   Up 5 minutes
```

Notice the `acme` prefix! ✅

```bash
curl http://localhost:18789/health
exit
```

**9.3 Test from local machine** (if servers are publicly accessible)

```bash
curl http://100.105.147.99:18789/health
curl http://100.105.148.100:18789/health
```

Both should return `{"status":"ok"}`.

**9.4 Verify container names are unique**

```bash
# Primary server
ssh -i ~/.ssh/openclaw/openclaw_deploy_key deploy@100.105.147.99 "docker ps --format '{{.Names}}'"
```

Output:
```
openclaw_PRD_gw
openclaw_PRD_cli
```

```bash
# ACME server
ssh -i ~/.ssh/openclaw/openclaw_deploy_key deploy@100.105.148.100 "docker ps --format '{{.Names}}'"
```

Output:
```
acme_openclaw_gw
acme_openclaw_cli
```

✅ **Container names are tenant-specific!**

**9.5 Verify data directories are separate**

```bash
# Primary
ssh -i ~/.ssh/openclaw/openclaw_deploy_key deploy@100.105.147.99 "ls -la ~/.openclaw-prd/"

# ACME
ssh -i ~/.ssh/openclaw/openclaw_deploy_key deploy@100.105.148.100 "ls -la ~/.openclaw-prd-acme/"
```

Each has their own workspace, agents, credentials, etc.

✅ **Full tenant isolation achieved!**

---

## ✅ SUCCESS!

You've successfully:
- ✅ Setup ACME tenant on new server
- ✅ Configured tenant-specific credentials
- ✅ Tested manual deployment
- ✅ Added tenant to server registry
- ✅ Activated multi-server workflow
- ✅ Deployed to both servers in parallel
- ✅ Verified tenant isolation

**You can now deploy to 2 servers automatically by pushing to PRD!**

---

## Adding Subsequent Servers (Quick Reference)

Once you've added your first additional server, adding more is much faster.

### Quick Steps (15-20 minutes per tenant)

**1. Run setup script:**
```bash
cd scripts/deployment
./setup-server.sh <server-ip> 22 --tenant <tenant-name>
```

**2. SSH and configure .env:**
```bash
ssh -i ~/.ssh/openclaw/openclaw_deploy_key deploy@<server-ip>
cd ~/openclaw-prd-<tenant-name>
nano .env  # Add Claude credentials
docker compose pull && docker compose up -d  # Test
exit
```

**3. Add to production.json:**
```bash
nano .github/servers/production.json
# Add new entry (copy/paste/modify existing entry)
cat .github/servers/production.json | jq .  # Validate
```

**4. Commit and push:**
```bash
git add .github/servers/production.json
git commit -m "feat: add <tenant-name> tenant"
git push origin PRD
```

**5. Watch GitHub Actions deployment**

**6. Verify on new server:**
```bash
ssh -i ~/.ssh/openclaw/openclaw_deploy_key deploy@<server-ip>
cd ~/openclaw-prd-<tenant-name>
docker compose ps
curl http://localhost:18789/health
exit
```

---

## Troubleshooting

### "SSH connection failed"

**Cause:** SSH key not authorized on server

**Fix:**
```bash
# Verify key exists
ls ~/.ssh/openclaw/openclaw_deploy_key

# Copy to server
ssh-copy-id -i ~/.ssh/openclaw/openclaw_deploy_key.pub deploy@<server-ip>

# Test
ssh -i ~/.ssh/openclaw/openclaw_deploy_key deploy@<server-ip>
```

### "Container name already in use"

**Cause:** Container prefix not unique

**Fix:**
```bash
# Check existing containers
docker ps -a

# Stop and remove
docker stop <container-name>
docker rm <container-name>

# Ensure unique tenant names in production.json
```

### "Health check failed"

**Cause:** Invalid credentials or service not starting

**Fix:**
```bash
ssh -i ~/.ssh/openclaw/openclaw_deploy_key deploy@<server-ip>
cd ~/openclaw-prd-<tenant>
docker compose logs openclaw-gateway

# Look for credential errors
# Fix .env if needed
docker compose restart
```

### "JSON parse error"

**Cause:** Invalid JSON syntax in production.json

**Fix:**
```bash
# Common mistakes:
# - Missing comma: } { should be }, {
# - Extra comma: }] should be }]
# - Missing quotes

# Validate
cat .github/servers/production.json | jq .
```

### "Deploy user not in docker group"

**Cause:** User can't run Docker commands

**Fix:**
```bash
ssh root@<server-ip>
usermod -aG docker deploy
newgrp docker
```

---

## Rollback Procedures

### Rollback to Phase 1 (Single Server)

If Phase 2 fails completely:

**1. Revert workflows:**
```bash
mv .github/workflows/deploy-prd.yml .github/workflows/deploy-prd-multi.yml.disabled
mv .github/workflows/deploy-prd-single.yml.disabled .github/workflows/deploy-prd.yml
```

**2. Revert production.json:**
```bash
# Remove new tenants, keep only primary
nano .github/servers/production.json
# Or restore from git
git checkout HEAD -- .github/servers/production.json
```

**3. Commit and push:**
```bash
git add .github/workflows/ .github/servers/production.json
git commit -m "rollback: revert to Phase 1 single-server deployment"
git push origin PRD
```

**4. Verify:**
- Check GitHub Actions
- Should deploy only to primary server

---

## Configuration Details

### Tenant Naming Rules

**Must follow:**
- Lowercase only
- Alphanumeric + hyphens
- No spaces, underscores, special chars
- Examples: `acme`, `widgets-inc`, `client-123`

**Used in:**
- Directory: `/home/deploy/openclaw-prd-{tenant}`
- Config: `/home/deploy/.openclaw-prd-{tenant}`
- Containers: `{tenant}_openclaw_gw`, `{tenant}_openclaw_cli`
- Registry: `prd-tenant-{tenant}`

### Port Configuration

**Standard setup** (recommended):
- Each tenant on separate server
- Gateway: `18789` (same on all servers)
- Bridge: `18790` (same on all servers)
- No conflicts because one tenant per server

**Alternative** (multiple tenants per server):
- Tenant 1: Gateway 18789, Bridge 18790
- Tenant 2: Gateway 18791, Bridge 18792
- Update production.json with different ports
- Update .env on server with correct ports

### Credentials Management

**Each tenant needs:**
- `OPENCLAW_GATEWAY_TOKEN` (auto-generated)
- `CLAUDE_AI_SESSION_KEY` (tenant-specific)
- `CLAUDE_WEB_SESSION_KEY` (tenant-specific)
- `CLAUDE_WEB_COOKIE` (tenant-specific)

**Security:**
- ❌ NEVER share credentials between tenants
- ✅ Store only in server's .env file
- ✅ Use different Claude accounts per tenant
- ✅ Rotate gateway tokens monthly

### Directory Structure Per Tenant

```
/home/deploy/
├── openclaw-prd-{tenant}/        # Deployment files
│   ├── .env                       # Tenant config
│   └── docker-compose.yml         # Copied from repo
├── .openclaw-prd-{tenant}/        # Runtime data
│   ├── workspace/                 # Tenant workspace
│   ├── agents/                    # Tenant agents
│   ├── credentials/               # Tenant credentials
│   ├── memory/                    # Tenant memory
│   └── sessions/                  # Tenant sessions
└── .config/gogcli/                # Shared (if using GOG)
```

---

## Next Steps

**Add more tenants:**
- Follow quick reference (15-20 min per tenant)
- Scale up to 20 servers

**Monitor deployments:**
- Set up uptime monitoring
- Alert on failures (GitHub Actions notifications)
- Track resource usage per tenant

**Document tenants:**
- Maintain contact info
- Track credentials securely
- Document any special configurations

**Plan for Phase 3** (if needed):
- When reaching 15-20 servers
- True auto-scaling based on load
- Kubernetes implementation
