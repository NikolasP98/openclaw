# Fork Documentation

This directory contains documentation for features specific to this fork that differ from upstream openclaw/openclaw.

## Fork-Specific Features

- [Docker Environment Naming](./docker-environments.md) - Multi-environment container naming support
- [Docker Gateway Setup](./docker-setup.md) - Gateway authentication and configuration

## Maintenance Notes

These docs should be updated when fork-specific features are added or modified. Core upstream features should be documented in the main docs/ tree.

## Why This Directory Exists

To avoid recurring merge conflicts with upstream documentation, fork-specific features are documented here rather than modifying upstream docs. This allows us to:

- Accept upstream's documentation changes without conflict
- Maintain clear separation between fork and upstream features
- Reduce merge friction when syncing with upstream

When syncing with upstream, the main documentation files (like `docs/install/docker.md`) should typically accept upstream's version, while this directory remains unchanged.
