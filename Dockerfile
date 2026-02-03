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
