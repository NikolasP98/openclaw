---
summary: "Optional Chromium browser support for Docker deployments"
read_when:
  - You need web automation or screenshot capabilities
  - You want to run Playwright or Puppeteer in Docker
  - You are validating browser-based workflows
title: "Browser Support"
---

# Browser Support (Optional)

OpenClaw's Docker image can optionally include Chromium browser support for web automation, screenshot capture, PDF generation, and testing. Browser support is **opt-in** to keep the base image lightweight.

## Use Cases

- **Web Automation**: Scraping, form filling, navigation automation
- **Screenshot Capture**: Visual testing, documentation, monitoring
- **PDF Generation**: Converting HTML to PDF
- **E2E Testing**: Browser-based integration tests
- **Browser Automation**: Playwright, Puppeteer, or direct CDP access

## Installation Options

Three tiers are available, each balancing size vs functionality:

### Option 1: Minimal (~300MB)

Headless Chromium only. Smallest footprint for basic automation.

```bash
export OPENCLAW_DOCKER_APT_PACKAGES="chromium"
./docker-setup.sh
```

Or via docker-compose.yml (uncomment the minimal option):
```yaml
build:
  args:
    OPENCLAW_DOCKER_APT_PACKAGES: "chromium"
```

### Option 2: Standard (~320MB) - Recommended

Chromium plus fonts for better rendering quality. Best for most use cases.

```bash
export OPENCLAW_DOCKER_APT_PACKAGES="chromium fonts-liberation fonts-noto-color-emoji"
./docker-setup.sh
```

Or via docker-compose.yml (uncomment the standard option):
```yaml
build:
  args:
    OPENCLAW_DOCKER_APT_PACKAGES: "chromium fonts-liberation fonts-noto-color-emoji"
```

### Option 3: Full (~400MB+)

Chromium, fonts, and VNC stack for remote viewing. Useful for debugging and visual verification.

```bash
export OPENCLAW_DOCKER_APT_PACKAGES="chromium fonts-liberation fonts-noto-color-emoji xvfb x11vnc novnc websockify socat"
./docker-setup.sh
```

Or via docker-compose.yml (uncomment the full option):
```yaml
build:
  args:
    OPENCLAW_DOCKER_APT_PACKAGES: "chromium fonts-liberation fonts-noto-color-emoji xvfb x11vnc novnc websockify socat"
```

## Size Comparison

| Configuration | Packages | Approx. Size Increase | Use When |
|---------------|----------|----------------------|----------|
| Base | None | 0MB | No browser needed |
| Minimal | chromium | ~300MB | Basic automation, CI/CD |
| Standard | chromium + fonts | ~320MB | Production automation |
| Full (VNC) | chromium + fonts + VNC | ~400MB+ | Debugging, visual verification |

## Build Methods

### Via docker-compose (recommended)

1. Edit `docker-compose.yml` and uncomment your desired option
2. Build the image:
   ```bash
   docker compose build gateway
   ```

### Via docker build directly

```bash
# Minimal
docker build --build-arg OPENCLAW_DOCKER_APT_PACKAGES="chromium" -t openclaw:browser .

# Standard
docker build --build-arg OPENCLAW_DOCKER_APT_PACKAGES="chromium fonts-liberation fonts-noto-color-emoji" -t openclaw:browser .

# Full (VNC)
docker build --build-arg OPENCLAW_DOCKER_APT_PACKAGES="chromium fonts-liberation fonts-noto-color-emoji xvfb x11vnc novnc websockify socat" -t openclaw:browser .
```

### Via docker-setup.sh

```bash
# Set the environment variable before running setup
export OPENCLAW_DOCKER_APT_PACKAGES="chromium fonts-liberation fonts-noto-color-emoji"
./docker-setup.sh
```

## VNC Access (Full Option Only)

When using the Full option with VNC stack, you can remotely view the browser:

### Expose VNC Ports

Add to your `docker-compose.yml` or docker run command:

```yaml
ports:
  - "5900:5900"  # VNC
  - "9222:9222"  # Chrome DevTools Protocol
```

Or with docker run:
```bash
docker run -p 5900:5900 -p 9222:9222 openclaw:browser
```

### Connect to VNC

- **VNC Client**: Connect to `vnc://localhost:5900`
- **noVNC Web**: Navigate to `http://localhost:6080` (if novnc is configured)
- **Chrome DevTools**: Connect to `http://localhost:9222` for CDP debugging

## Browser Configuration

### Chromium Flags

Pass flags via environment variables or startup commands:

```yaml
environment:
  CHROMIUM_FLAGS: "--no-sandbox --disable-dev-shm-usage --disable-gpu"
```

Common flags:
- `--no-sandbox`: Required when running as non-root
- `--disable-dev-shm-usage`: Prevents `/dev/shm` issues in containers
- `--disable-gpu`: Disables GPU acceleration (headless)
- `--headless`: Run in headless mode (default)

### Persistent Browser State

Mount a volume for browser user data:

```yaml
volumes:
  - ${OPENCLAW_BROWSER_DATA:-~/.openclaw/browser-data}:/home/node/.config/chromium
```

This persists:
- Cookies and session data
- Browser cache
- Extensions (if installed)
- User preferences

## Integration with Automation Tools

### Playwright

Playwright can use system Chromium:

```typescript
import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
```

### Puppeteer

Puppeteer configuration:

```typescript
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
```

### Direct CDP Access

Connect via Chrome DevTools Protocol:

```bash
chromium --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0
```

## Verification

### Test Chromium Installation

```bash
# Via docker compose
docker compose run --rm openclaw-cli chromium --version

# Via docker run
docker run --rm openclaw:browser chromium --version
```

Expected output:
```
Chromium 131.0.6778.85
```

### Test Browser Automation

Simple test script:

```bash
docker compose run --rm openclaw-cli bash -c '
chromium --headless --no-sandbox --disable-gpu --screenshot=/tmp/test.png https://example.com
ls -lh /tmp/test.png
'
```

### Test VNC (Full Option)

```bash
# Start container with VNC
docker compose up -d openclaw-gateway

# Verify VNC is running
docker compose exec openclaw-gateway x11vnc -version
```

## Troubleshooting

### "chromium: command not found"

The browser packages were not installed. Verify `OPENCLAW_DOCKER_APT_PACKAGES` is set correctly and rebuild:

```bash
docker compose build --no-cache gateway
```

### Chromium Crashes with "No usable sandbox"

Add `--no-sandbox` flag or run as root (not recommended for production).

### Font Rendering Issues

Use the Standard or Full option to include font packages. Verify fonts are installed:

```bash
docker compose run --rm openclaw-cli fc-list
```

### VNC Connection Refused

Verify VNC is running and ports are exposed:

```bash
docker compose exec openclaw-gateway ps aux | grep vnc
docker compose port openclaw-gateway 5900
```

### Performance Issues

For heavy browser workloads, increase container resources:

```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 4G
```

## Security Considerations

### Running as Non-Root

The default `node` user (uid 1000) requires `--no-sandbox` flag for Chromium. For better security:

1. Use a sandbox-enabled configuration (requires root or capabilities)
2. Or accept the `--no-sandbox` trade-off for containerized isolation

### Network Isolation

When running browser automation, consider network policies:

```yaml
networks:
  browser_net:
    driver: bridge
    internal: false  # Allow egress for web browsing
```

### Resource Limits

Prevent resource exhaustion:

```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 4G
    reservations:
      memory: 1G
```

## Advanced Usage

### Multiple Browser Instances

For parallel automation, use separate containers or browser contexts:

```typescript
// Browser contexts (lightweight)
const context1 = await browser.newContext();
const context2 = await browser.newContext();

// Separate pages
const page1 = await context1.newPage();
const page2 = await context2.newPage();
```

### Custom Browser Extensions

Mount extensions directory:

```yaml
volumes:
  - ./browser-extensions:/home/node/.config/chromium/Default/Extensions
```

### Headless vs Headful

Full option supports both modes:

```bash
# Headless (default)
chromium --headless --no-sandbox https://example.com

# Headful (via Xvfb)
DISPLAY=:99 chromium --no-sandbox https://example.com
```

## Related Documentation

- [Docker Installation](/install/docker)
- [Docker Setup (Fork)](/fork/docker-setup)
- [Sandbox Browser Image](/install/docker#sandbox-browser-image)
- [Agent Sandbox Configuration](/install/docker#agent-sandbox-host-gateway--docker-tools)

## Notes

- Browser support is **optional** to minimize base image size
- The existing `Dockerfile` already supports this via `OPENCLAW_DOCKER_APT_PACKAGES`
- No changes to the Dockerfile itself are needed
- The `Dockerfile.sandbox-browser` demonstrates this approach works well
- For production workloads, recommend the **Standard** option (fonts included)
- Persistent browser state requires volume mounts for `/home/node/.config/chromium`
