FROM node:22-bookworm

# Install Bun globally
ENV BUN_INSTALL=/usr/local
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/usr/local/bin:${PATH}"

RUN corepack enable

WORKDIR /app

# Install runtime packages and clean up in single layer
# - sqlite3: for cookie/session database queries
# - jq: for JSON processing in scripts
# - ffmpeg: for video-frames skill (optional but commonly used)
# - gosu: for privilege dropping in entrypoint
ARG OPENCLAW_DOCKER_APT_PACKAGES=""
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    sqlite3 \
    jq \
    ffmpeg \
    gosu \
    poppler-utils \
    $OPENCLAW_DOCKER_APT_PACKAGES && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Install CLI tools from GitHub releases (consolidated into single layer)
# - gh: GitHub CLI
# - obsidian-cli: Obsidian vault management
# - gogcli: Google services CLI (Gmail/GCal/GDrive)
ARG GH_CLI_VERSION=2.64.0
ARG OBSIDIAN_CLI_VERSION=0.2.3
ARG GOGCLI_VERSION=0.9.0
ARG TARGETARCH
RUN curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_CLI_VERSION}/gh_${GH_CLI_VERSION}_linux_${TARGETARCH}.tar.gz" | \
    tar -xzf - --strip-components=2 -C /usr/local/bin "gh_${GH_CLI_VERSION}_linux_${TARGETARCH}/bin/gh" && \
    curl -fsSL "https://github.com/yakitrak/obsidian-cli/releases/download/v${OBSIDIAN_CLI_VERSION}/obsidian-cli_${OBSIDIAN_CLI_VERSION}_linux_${TARGETARCH}.tar.gz" | \
    tar -xzf - -C /usr/local/bin obsidian-cli && \
    curl -fsSL "https://github.com/steipete/gogcli/releases/download/v${GOGCLI_VERSION}/gogcli_${GOGCLI_VERSION}_linux_${TARGETARCH}.tar.gz" | \
    tar -xzf - -C /usr/local/bin gog && \
    chmod +x /usr/local/bin/gh /usr/local/bin/obsidian-cli /usr/local/bin/gog

# Install uv (Python package manager) and nano-pdf
ENV UV_INSTALL_DIR="/usr/local/bin"
ENV UV_TOOL_DIR="/usr/local/share/uv-tools"
ENV UV_TOOL_BIN_DIR="/usr/local/bin"
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    /usr/local/bin/uv tool install nano-pdf

# Install bun global packages
# - mcporter: Model Context Protocol tools
# - qmd: Optional memory search backend (users opt-in via config: memory.backend = "qmd")
RUN bun install -g mcporter && \
    bun install -g github:tobi/qmd

# Copy dependency manifests first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY ui/package.json ./ui/package.json
COPY patches ./patches
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN OPENCLAW_A2UI_SKIP_MISSING=1 pnpm build

# Force pnpm for UI build (Bun may fail on ARM/Synology architectures)
ENV OPENCLAW_PREFER_PNPM=1
RUN pnpm ui:build

ENV NODE_ENV=production

# Copy entrypoint and default config, set permissions (before switching to non-root)
COPY docker/entrypoint.sh /app/docker/entrypoint.sh
COPY docker/default-config.json /app/docker/default-config.json
RUN chmod +x /app/docker/entrypoint.sh && \
    chown -R node:node /app

# Note: Container starts as root to allow entrypoint to fix mounted directory permissions
# The entrypoint script will drop privileges to 'node' user (uid 1000) before running the app

ENTRYPOINT ["/app/docker/entrypoint.sh"]

# Start gateway server with pre-baked config.
# Binds to LAN (0.0.0.0) - auth is enforced via OPENCLAW_GATEWAY_TOKEN env var.
CMD ["node", "dist/index.js", "gateway", "--bind", "lan", "--port", "18789"]
