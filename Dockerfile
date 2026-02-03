FROM node:22-bookworm

# Install Bun globally (for all users including runtime node user)
# BUN_INSTALL=/usr/local ensures bun binary goes to /usr/local/bin
ENV BUN_INSTALL=/usr/local
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/usr/local/bin:${PATH}"

RUN corepack enable

WORKDIR /app

ARG OPENCLAW_DOCKER_APT_PACKAGES=""
RUN if [ -n "$OPENCLAW_DOCKER_APT_PACKAGES" ]; then \
      apt-get update && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $OPENCLAW_DOCKER_APT_PACKAGES && \
      apt-get clean && \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi

# Install GitHub CLI (gh) from official GitHub apt repo
# Note: Debian native package is outdated; use official repo for latest version
RUN mkdir -p -m 755 /etc/apt/keyrings && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends gh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Homebrew (required for obsidian-cli)
ENV HOMEBREW_PREFIX="/home/linuxbrew/.linuxbrew"
ENV HOMEBREW_CELLAR="${HOMEBREW_PREFIX}/Cellar"
ENV HOMEBREW_REPOSITORY="${HOMEBREW_PREFIX}/Homebrew"
ENV PATH="${HOMEBREW_PREFIX}/bin:${HOMEBREW_PREFIX}/sbin:${PATH}"
RUN useradd -m -s /bin/bash linuxbrew && \
    mkdir -p "${HOMEBREW_PREFIX}" && \
    chown -R linuxbrew:linuxbrew "$(dirname "${HOMEBREW_PREFIX}")" && \
    su - linuxbrew -c "NONINTERACTIVE=1 CI=1 /bin/bash -c 'curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh | bash'" && \
    ln -sf "${HOMEBREW_PREFIX}/bin/brew" /usr/local/bin/brew

# Install obsidian-cli via Homebrew (run as linuxbrew user who owns Homebrew)
# Use explicit path to avoid shell profile issues
RUN su linuxbrew -c "${HOMEBREW_PREFIX}/bin/brew install yakitrak/yakitrak/obsidian-cli" && \
    ln -sf "${HOMEBREW_PREFIX}/bin/obsidian-cli" /usr/local/bin/obsidian-cli

# Install uv (Python package manager)
# UV_INSTALL_DIR sets install location; binaries go directly there (not in bin subdir)
ENV UV_INSTALL_DIR="/usr/local/bin"
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    ls -la /usr/local/bin/uv

# Install nano-pdf via uv (use env vars for tool/bin directories)
ENV UV_TOOL_DIR="/usr/local/share/uv-tools"
ENV UV_TOOL_BIN_DIR="/usr/local/bin"
RUN /usr/local/bin/uv tool install nano-pdf

# Install mcporter globally via bun
RUN bun install -g mcporter

# Install QMD globally (optional memory search backend)
# Users opt-in via config: memory.backend = "qmd"
# Falls back to builtin SQLite if QMD fails
RUN bun install -g github:tobi/qmd

# Install gogcli (Google CLI for Gmail/GCal/GDrive) from GitHub releases
# Download pre-built binary for the target architecture
ARG GOGCLI_VERSION=0.9.0
ARG TARGETARCH
RUN curl -fsSL "https://github.com/steipete/gogcli/releases/download/v${GOGCLI_VERSION}/gogcli_${GOGCLI_VERSION}_linux_${TARGETARCH}.tar.gz" \
    -o /tmp/gogcli.tar.gz && \
    tar -xzf /tmp/gogcli.tar.gz -C /tmp && \
    mv /tmp/gog /usr/local/bin/gog && \
    chmod +x /usr/local/bin/gog && \
    rm -rf /tmp/gogcli.tar.gz /tmp/gog* && \
    gog --version

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
# This reduces the attack surface by preventing container escape via root privileges
USER node

# Entrypoint populates missing config/dirs at runtime (respects mounted volumes)
# Default config template stays in /app/docker for entrypoint to copy from
COPY --chown=node:node docker/entrypoint.sh /app/docker/entrypoint.sh
RUN chmod +x /app/docker/entrypoint.sh

ENTRYPOINT ["/app/docker/entrypoint.sh"]

# Start gateway server with pre-baked config.
# Binds to LAN (0.0.0.0) - auth is enforced via OPENCLAW_GATEWAY_TOKEN env var.
CMD ["node", "dist/index.js", "gateway", "--bind", "lan", "--port", "18789"]
