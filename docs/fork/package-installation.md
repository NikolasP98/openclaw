# Package Installation

## Custom Fork Package

**CRITICAL:** All OpenClaw installations for this fork MUST use the custom scoped package:

```bash
npm install -g @nikolasp98/openclaw
```

**DO NOT** use the upstream package `@anthropic/openclaw` or generic `openclaw` from npm registry.

## Why This Matters

This fork maintains custom features, modifications, and configurations that are not present in upstream OpenClaw. Using the wrong package will result in:

- Missing fork-specific features
- Configuration incompatibilities
- Potential breakage of deployment workflows

## Installation Methods

### Package Installation (Recommended)

Fast installation without building from source:

```bash
# npm (default)
npm install -g @nikolasp98/openclaw

# pnpm
pnpm add -g @nikolasp98/openclaw

# bun
bun install -g @nikolasp98/openclaw
```

### Source Installation

For development or custom modifications:

```bash
git clone https://github.com/NikolasP98/openclaw.git
cd openclaw
pnpm install
pnpm build
pnpm link --global
```

## Setup Script Integration

The automated setup script (`setup/setup.sh`) is already configured to use the correct custom package:

```bash
./setup/setup.sh --install-method=package --pkg-manager=npm
```

The default configuration in `setup/config/defaults.yaml` specifies:

```yaml
install:
  method: package # npm install -g @nikolasp98/openclaw
```

## Verification

After installation, verify you're using the correct package:

```bash
# Check the binary path
which openclaw

# It should point to:
# /usr/bin/openclaw -> /usr/lib/node_modules/@nikolasp98/openclaw/openclaw.mjs

# Check version
openclaw --version
```

## Server Deployments

All production and development servers use the custom package:

- **protopi**: `@nikolasp98/openclaw` version 2026.2.15-1
- **prd-faces** (nc-faces): Uses custom package via setup script
- **prd-bernibites**: Uses custom package via setup script

## Troubleshooting

If you accidentally installed the wrong package:

```bash
# Remove the upstream package
npm uninstall -g openclaw
npm uninstall -g @anthropic/openclaw

# Install the correct custom package
npm install -g @nikolasp98/openclaw
```

## Related Documentation

- [Fork Overview](./README.md)
- [Docker Setup](./docker-setup.md)
- [Docker Environment Naming](./docker-environments.md)
