# =============================================================================
# Stage 1: Builder - Install dependencies and build the application
# =============================================================================
FROM node:22-bookworm AS builder

# Install Bun globally
ENV BUN_INSTALL=/usr/local
RUN curl -fsSL https://bun.sh/install | bash

RUN corepack enable

WORKDIR /app

# Copy dependency manifests first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY ui/package.json ./ui/package.json
COPY patches ./patches
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile

# Copy source code and build
COPY . .
RUN OPENCLAW_A2UI_SKIP_MISSING=1 pnpm build

# Force pnpm for UI build (Bun may fail on ARM/Synology architectures)
ENV OPENCLAW_PREFER_PNPM=1
RUN pnpm ui:build

# Prune dev dependencies for smaller production image
RUN pnpm prune --prod

# =============================================================================
# Stage 2: Tools - Download static binaries for CLI tools
# =============================================================================
FROM debian:bookworm-slim AS tools

ARG TARGETARCH

# Tool versions - update these as needed
ARG GH_CLI_VERSION=2.64.0
ARG OBSIDIAN_CLI_VERSION=0.2.3
ARG GOGCLI_VERSION=0.9.0

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /tools

# GitHub CLI - download from official releases
RUN curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_CLI_VERSION}/gh_${GH_CLI_VERSION}_linux_${TARGETARCH}.tar.gz" | \
    tar -xzf - --strip-components=2 -C /tools "gh_${GH_CLI_VERSION}_linux_${TARGETARCH}/bin/gh" && \
    chmod +x /tools/gh

# obsidian-cli - download from GitHub releases (replaces Homebrew install)
RUN curl -fsSL "https://github.com/yakitrak/obsidian-cli/releases/download/v${OBSIDIAN_CLI_VERSION}/obsidian-cli_${OBSIDIAN_CLI_VERSION}_linux_${TARGETARCH}.tar.gz" | \
    tar -xzf - -C /tools obsidian-cli && \
    chmod +x /tools/obsidian-cli

# gogcli - download from GitHub releases (replaces Homebrew install)
RUN curl -fsSL "https://github.com/steipete/gogcli/releases/download/v${GOGCLI_VERSION}/gogcli_${GOGCLI_VERSION}_linux_${TARGETARCH}.tar.gz" | \
    tar -xzf - -C /tools gog && \
    chmod +x /tools/gog

# =============================================================================
# Stage 3: Runtime - Minimal production image
# =============================================================================
FROM node:22-bookworm-slim AS runtime

# Install runtime dependencies
# - ca-certificates, curl: for network operations
# - sqlite3: for cookie/session database queries
# - jq: for JSON processing in scripts
# - ffmpeg: for video-frames skill (optional but commonly used)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    sqlite3 \
    jq \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install Bun globally (needed for some runtime tools like mcporter, qmd)
ENV BUN_INSTALL=/usr/local
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/usr/local/bin:${PATH}"

# Install uv (Python package manager) for nano-pdf
ENV UV_INSTALL_DIR="/usr/local/bin"
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

# Install nano-pdf via uv
ENV UV_TOOL_DIR="/usr/local/share/uv-tools"
ENV UV_TOOL_BIN_DIR="/usr/local/bin"
RUN /usr/local/bin/uv tool install nano-pdf

# Install mcporter globally via bun
RUN bun install -g mcporter

# Install QMD globally (optional memory search backend)
# Users opt-in via config: memory.backend = "qmd"
RUN bun install -g github:tobi/qmd

# Copy static binary tools from tools stage
COPY --from=tools /tools/gh /usr/local/bin/gh
COPY --from=tools /tools/obsidian-cli /usr/local/bin/obsidian-cli
COPY --from=tools /tools/gog /usr/local/bin/gog

WORKDIR /app

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/ui/dist ./ui/dist

# Copy entrypoint and default config
COPY --chown=node:node docker/entrypoint.sh /app/docker/entrypoint.sh
COPY --chown=node:node docker/default-config.json /app/docker/default-config.json
RUN chmod +x /app/docker/entrypoint.sh

ENV NODE_ENV=production

# Create directories and set ownership for non-root user
RUN mkdir -p /home/node/.openclaw /home/node/.config/gogcli && \
    chown -R node:node /home/node /app

# Security hardening: Run as non-root user
# The node:22-bookworm-slim image includes a 'node' user (uid 1000)
USER node

# Entrypoint populates missing config/dirs at runtime (respects mounted volumes)
ENTRYPOINT ["/app/docker/entrypoint.sh"]

# Start gateway server with pre-baked config.
# Binds to LAN (0.0.0.0) - auth is enforced via OPENCLAW_GATEWAY_TOKEN env var.
CMD ["node", "dist/index.js", "gateway", "--bind", "lan", "--port", "18789"]
