# MinionDock <!-- omit in toc -->

Stop typing `docker-compose` commands. Just type `miniondock-start`.

Inspired by Simon Willison's [Running Minion in Docker](https://til.simonwillison.net/llms/minion-docker).

- [Quickstart](#quickstart)
- [Available Commands](#available-commands)
  - [Basic Operations](#basic-operations)
  - [Container Access](#container-access)
  - [Web UI \& Devices](#web-ui--devices)
  - [Setup \& Configuration](#setup--configuration)
  - [Maintenance](#maintenance)
  - [Utilities](#utilities)
- [Common Workflows](#common-workflows)
  - [Check Status and Logs](#check-status-and-logs)
  - [Set Up WhatsApp Bot](#set-up-whatsapp-bot)
  - [Troubleshooting Device Pairing](#troubleshooting-device-pairing)
  - [Fix Token Mismatch Issues](#fix-token-mismatch-issues)
  - [Permission Denied](#permission-denied)
- [Requirements](#requirements)

## Quickstart

**Install:**

```bash
mkdir -p ~/.miniondock && curl -sL https://raw.githubusercontent.com/minion/minion/main/scripts/shell-helpers/miniondock-helpers.sh -o ~/.miniondock/miniondock-helpers.sh
```

```bash
echo 'source ~/.miniondock/miniondock-helpers.sh' >> ~/.zshrc && source ~/.zshrc
```

**See what you get:**

```bash
miniondock-help
```

On first command, MinionDock auto-detects your Minion directory:

- Checks common paths (`~/minion`, `~/workspace/minion`, etc.)
- If found, asks you to confirm
- Saves to `~/.miniondock/config`

**First time setup:**

```bash
miniondock-start
```

```bash
miniondock-fix-token
```

```bash
miniondock-dashboard
```

If you see "pairing required":

```bash
miniondock-devices
```

And approve the request for the specific device:

```bash
miniondock-approve <request-id>
```

## Available Commands

### Basic Operations

| Command              | Description                     |
| -------------------- | ------------------------------- |
| `miniondock-start`   | Start the gateway               |
| `miniondock-stop`    | Stop the gateway                |
| `miniondock-restart` | Restart the gateway             |
| `miniondock-status`  | Check container status          |
| `miniondock-logs`    | View live logs (follows output) |

### Container Access

| Command                     | Description                                    |
| --------------------------- | ---------------------------------------------- |
| `miniondock-shell`          | Interactive shell inside the gateway container |
| `miniondock-cli <command>`  | Run Minion CLI commands                        |
| `miniondock-exec <command>` | Execute arbitrary commands in the container    |

### Web UI & Devices

| Command                   | Description                                |
| ------------------------- | ------------------------------------------ |
| `miniondock-dashboard`    | Open web UI in browser with authentication |
| `miniondock-devices`      | List device pairing requests               |
| `miniondock-approve <id>` | Approve a device pairing request           |

### Setup & Configuration

| Command                | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `miniondock-fix-token` | Configure gateway authentication token (run once) |

### Maintenance

| Command              | Description                                      |
| -------------------- | ------------------------------------------------ |
| `miniondock-rebuild` | Rebuild the Docker image                         |
| `miniondock-clean`   | Remove all containers and volumes (destructive!) |

### Utilities

| Command                | Description                               |
| ---------------------- | ----------------------------------------- |
| `miniondock-health`    | Run gateway health check                  |
| `miniondock-token`     | Display the gateway authentication token  |
| `miniondock-cd`        | Jump to the Minion project directory      |
| `miniondock-config`    | Open the Minion config directory          |
| `miniondock-workspace` | Open the workspace directory              |
| `miniondock-help`      | Show all available commands with examples |

## Common Workflows

### Check Status and Logs

**Restart the gateway:**

```bash
miniondock-restart
```

**Check container status:**

```bash
miniondock-status
```

**View live logs:**

```bash
miniondock-logs
```

### Set Up WhatsApp Bot

**Shell into the container:**

```bash
miniondock-shell
```

**Inside the container, login to WhatsApp:**

```bash
minion channels login --channel whatsapp --verbose
```

Scan the QR code with WhatsApp on your phone.

**Verify connection:**

```bash
minion status
```

### Troubleshooting Device Pairing

**Check for pending pairing requests:**

```bash
miniondock-devices
```

**Copy the Request ID from the "Pending" table, then approve:**

```bash
miniondock-approve <request-id>
```

Then refresh your browser.

### Fix Token Mismatch Issues

If you see "gateway token mismatch" errors:

```bash
miniondock-fix-token
```

This will:

1. Read the token from your `.env` file
2. Configure it in the Minion config
3. Restart the gateway
4. Verify the configuration

### Permission Denied

**Ensure Docker is running and you have permission:**

```bash
docker ps
```

## Requirements

- Docker and Docker Compose installed
- Bash or Zsh shell
- Minion project (from `docker-setup.sh`)

## Development

**Test with fresh config (mimics first-time install):**

```bash
unset CLAWDOCK_DIR && rm -f ~/.miniondock/config && source scripts/shell-helpers/miniondock-helpers.sh
```

Then run any command to trigger auto-detect:

```bash
miniondock-start
```
