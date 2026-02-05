FROM node:22-bookworm

# Install Bun globally
ENV BUN_INSTALL=/usr/local
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/usr/local/bin:${PATH}"

RUN corepack enable

WORKDIR /app

# Install runtime packages
# - sqlite3: for cookie/session database queries
# - jq: for JSON processing in scripts
# - ffmpeg: for video-frames skill (optional but commonly used)
ARG OPENCLAW_DOCKER_APT_PACKAGES=""
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    sqlite3 \
    jq \
    ffmpeg \
    $OPENCLAW_DOCKER_APT_PACKAGES && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Install GitHub CLI from GitHub releases (instead of apt repo)
ARG GH_CLI_VERSION=2.64.0
ARG TARGETARCH
RUN curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_CLI_VERSION}/gh_${GH_CLI_VERSION}_linux_${TARGETARCH}.tar.gz" | \
    tar -xzf - --strip-components=2 -C /usr/local/bin "gh_${GH_CLI_VERSION}_linux_${TARGETARCH}/bin/gh" && \
    chmod +x /usr/local/bin/gh

# Install obsidian-cli from GitHub releases (instead of Homebrew)
ARG OBSIDIAN_CLI_VERSION=0.2.3
RUN curl -fsSL "https://github.com/yakitrak/obsidian-cli/releases/download/v${OBSIDIAN_CLI_VERSION}/obsidian-cli_${OBSIDIAN_CLI_VERSION}_linux_${TARGETARCH}.tar.gz" | \
    tar -xzf - -C /usr/local/bin obsidian-cli && \
    chmod +x /usr/local/bin/obsidian-cli

# Install gogcli from GitHub releases (instead of Homebrew)
ARG GOGCLI_VERSION=0.9.0
RUN curl -fsSL "https://github.com/steipete/gogcli/releases/download/v${GOGCLI_VERSION}/gogcli_${GOGCLI_VERSION}_linux_${TARGETARCH}.tar.gz" | \
    tar -xzf - -C /usr/local/bin gog && \
    chmod +x /usr/local/bin/gog

# Install uv (Python package manager)
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

# Copy dependency manifests first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY ui/package.json ./ui/package.json
COPY patches ./patches
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile

COPY . .
RUN OPENCLAW_A2UI_SKIP_MISSING=1 pnpm build

# Force pnpm for UI build (Bun may fail on ARM/Synology architectures)
ENV OPENCLAW_PREFER_PNPM=1
RUN pnpm ui:build

ENV NODE_ENV=production

# Allow non-root user to write temp files during runtime/tests.
RUN chown -R node:node /app

# Security hardening: Run as non-root user
# The node:22-bookworm image includes a 'node' user (uid 1000)
USER node

# Entrypoint populates missing config/dirs at runtime (respects mounted volumes)
COPY --chown=node:node docker/entrypoint.sh /app/docker/entrypoint.sh
RUN chmod +x /app/docker/entrypoint.sh

ENTRYPOINT ["/app/docker/entrypoint.sh"]

# Start gateway server with pre-baked config.
# Binds to LAN (0.0.0.0) - auth is enforced via OPENCLAW_GATEWAY_TOKEN env var.
CMD ["node", "dist/index.js", "gateway", "--bind", "lan", "--port", "18789"]
