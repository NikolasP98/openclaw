import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
const isWindows = process.platform === "win32";
const localWorkers = Math.max(4, Math.min(16, os.cpus().length));
const ciWorkers = isWindows ? 2 : 3;

export default defineConfig({
  resolve: {
    // Keep this ordered: the base `minion/plugin-sdk` alias is a prefix match.
    alias: [
      {
        find: "minion/plugin-sdk/account-id",
        replacement: path.join(repoRoot, "src", "plugin-sdk", "account-id.ts"),
      },
      {
        find: "minion/plugin-sdk",
        replacement: path.join(repoRoot, "src", "plugin-sdk", "index.ts"),
      },
    ],
  },
  test: {
    testTimeout: 120_000,
    hookTimeout: isWindows ? 180_000 : 120_000,
    // Many suites rely on `vi.stubEnv(...)` and expect it to be scoped to the test.
    // This is especially important under `pool=vmForks` where env leaks cross-file.
    unstubEnvs: true,
    // Same rationale as unstubEnvs: avoid cross-test pollution under vmForks.
    unstubGlobals: true,
    pool: "forks",
    maxWorkers: isCI ? ciWorkers : localWorkers,
    include: ["src/**/*.test.ts", "extensions/**/*.test.ts", "test/format-error.test.ts"],
    setupFiles: ["test/setup.ts"],
    exclude: [
      "dist/**",
      "apps/macos/**",
      "apps/macos/.build/**",
      "**/node_modules/**",
      "**/vendor/**",
      "dist/OpenClaw.app/**",
      "**/*.live.test.ts",
      "**/*.e2e.test.ts",
    ],
    // Coverage thresholds: 70% line/function/statement, 55% branch.
    // These reflect the current codebase maturity. Excluded paths below
    // fall into categories that are validated through other means (e2e,
    // Docker smoke tests, manual QA). When adding new exclusions, add a
    // comment explaining which test strategy covers the excluded code.
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 55,
        statements: 70,
      },
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",

        // --- Entrypoints & CLI wiring ---
        // Thin wiring layers covered by CI install-smoke and e2e Docker tests.
        "src/entry.ts",
        "src/index.ts",
        "src/runtime.ts",
        "src/cli/**",
        "src/commands/**",
        "src/daemon/**",
        "src/hooks/**",
        "src/macos/**",

        // --- Agent integrations (e2e/manual) ---
        // Require live model providers or sandbox environments to test.
        "src/agents/model-scan.ts",
        "src/agents/pi-embedded-runner.ts",
        "src/agents/sandbox-paths.ts",
        "src/agents/sandbox.ts",
        "src/agents/skills-install.ts",
        "src/agents/pi-tool-definition-adapter.ts",
        "src/agents/tools/discord-actions*.ts",
        "src/agents/tools/slack-actions.ts",

        // --- Gateway server methods (e2e/manual) ---
        // HTTP/WebSocket handlers validated via gateway e2e and Docker tests.
        "src/gateway/control-ui.ts",
        "src/gateway/server-bridge.ts",
        "src/gateway/server-channels.ts",
        "src/gateway/server-methods/config.ts",
        "src/gateway/server-methods/send.ts",
        "src/gateway/server-methods/skills.ts",
        "src/gateway/server-methods/talk.ts",
        "src/gateway/server-methods/web.ts",
        "src/gateway/server-methods/wizard.ts",
        "src/gateway/server.ts",
        "src/gateway/client.ts",
        "src/gateway/protocol/**",

        // --- Process bridges (hard to isolate) ---
        // IPC/RPC layers that require running child processes.
        "src/gateway/call.ts",
        "src/process/tau-rpc.ts",
        "src/process/exec.ts",

        // --- Interactive UIs (manual) ---
        // Terminal and onboarding flows requiring interactive input.
        "src/tui/**",
        "src/wizard/**",

        // --- Channel surfaces (integration-tested) ---
        // Each channel has platform-specific API dependencies.
        "src/discord/**",
        "src/imessage/**",
        "src/signal/**",
        "src/slack/**",
        "src/browser/**",
        "src/channels/web/**",
        "src/telegram/**",
        "src/webchat/**",

        // --- Infrastructure (environment-dependent) ---
        "src/infra/tailscale.ts",
      ],
    },
  },
});
