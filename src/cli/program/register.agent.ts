import type { Command } from "commander";
import { DEFAULT_CHAT_CHANNEL } from "../../channels/registry.js";
import { agentCliCommand } from "../../commands/agent-via-gateway.js";
import {
  agentsAddCommand,
  agentsDeleteCommand,
  agentsListCommand,
  agentsSetIdentityCommand,
} from "../../commands/agents.js";
import {
  aiProvidersAddCommand,
  aiProvidersListCommand,
  aiProvidersRevokeCommand,
  agentKeysCreateCommand,
  agentKeysListCommand,
  agentKeysRevokeCommand,
  agentKeysRotateCommand,
} from "../../commands/provisioning.js";
import { setVerbose } from "../../globals.js";
import { defaultRuntime } from "../../runtime.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { hasExplicitOptions } from "../command-options.js";
import { createDefaultDeps } from "../deps.js";
import { formatHelpExamples } from "../help-format.js";
import { collectOption } from "./helpers.js";

export function registerAgentCommands(program: Command, args: { agentChannelOptions: string }) {
  program
    .command("agent")
    .description("Run an agent turn via the Gateway (use --local for embedded)")
    .requiredOption("-m, --message <text>", "Message body for the agent")
    .option("-t, --to <number>", "Recipient number in E.164 used to derive the session key")
    .option("--session-id <id>", "Use an explicit session id")
    .option("--agent <id>", "Agent id (overrides routing bindings)")
    .option("--thinking <level>", "Thinking level: off | minimal | low | medium | high")
    .option("--verbose <on|off>", "Persist agent verbose level for the session")
    .option(
      "--channel <channel>",
      `Delivery channel: ${args.agentChannelOptions} (default: ${DEFAULT_CHAT_CHANNEL})`,
    )
    .option("--reply-to <target>", "Delivery target override (separate from session routing)")
    .option("--reply-channel <channel>", "Delivery channel override (separate from routing)")
    .option("--reply-account <id>", "Delivery account id override")
    .option(
      "--local",
      "Run the embedded agent locally (requires model provider API keys in your shell)",
      false,
    )
    .option("--deliver", "Send the agent's reply back to the selected channel", false)
    .option("--json", "Output result as JSON", false)
    .option(
      "--timeout <seconds>",
      "Override agent command timeout (seconds, default 600 or config value)",
    )
    .addHelpText(
      "after",
      () =>
        `
${theme.heading("Examples:")}
${formatHelpExamples([
  ['openclaw agent --to +15555550123 --message "status update"', "Start a new session."],
  ['openclaw agent --agent ops --message "Summarize logs"', "Use a specific agent."],
  [
    'openclaw agent --session-id 1234 --message "Summarize inbox" --thinking medium',
    "Target a session with explicit thinking level.",
  ],
  [
    'openclaw agent --to +15555550123 --message "Trace logs" --verbose on --json',
    "Enable verbose logging and JSON output.",
  ],
  ['openclaw agent --to +15555550123 --message "Summon reply" --deliver', "Deliver reply."],
  [
    'openclaw agent --agent ops --message "Generate report" --deliver --reply-channel slack --reply-to "#reports"',
    "Send reply to a different channel/target.",
  ],
])}

${theme.muted("Docs:")} ${formatDocsLink("/cli/agent", "docs.openclaw.ai/cli/agent")}`,
    )
    .action(async (opts) => {
      const verboseLevel = typeof opts.verbose === "string" ? opts.verbose.toLowerCase() : "";
      setVerbose(verboseLevel === "on");
      // Build default deps (keeps parity with other commands; future-proofing).
      const deps = createDefaultDeps();
      await runCommandWithRuntime(defaultRuntime, async () => {
        await agentCliCommand(opts, defaultRuntime, deps);
      });
    });

  const agents = program
    .command("agents")
    .description("Manage isolated agents (workspaces + auth + routing)")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/agents", "docs.openclaw.ai/cli/agents")}\n`,
    );

  agents
    .command("list")
    .description("List configured agents")
    .option("--json", "Output JSON instead of text", false)
    .option("--bindings", "Include routing bindings", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await agentsListCommand(
          { json: Boolean(opts.json), bindings: Boolean(opts.bindings) },
          defaultRuntime,
        );
      });
    });

  agents
    .command("add [name]")
    .description("Add a new isolated agent")
    .option("--workspace <dir>", "Workspace directory for the new agent")
    .option("--model <id>", "Model id for this agent")
    .option("--agent-dir <dir>", "Agent state directory for this agent")
    .option("--bind <channel[:accountId]>", "Route channel binding (repeatable)", collectOption, [])
    .option("--non-interactive", "Disable prompts; requires --workspace", false)
    .option("--json", "Output JSON summary", false)
    .action(async (name, opts, command) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const hasFlags = hasExplicitOptions(command, [
          "workspace",
          "model",
          "agentDir",
          "bind",
          "nonInteractive",
        ]);
        await agentsAddCommand(
          {
            name: typeof name === "string" ? name : undefined,
            workspace: opts.workspace as string | undefined,
            model: opts.model as string | undefined,
            agentDir: opts.agentDir as string | undefined,
            bind: Array.isArray(opts.bind) ? (opts.bind as string[]) : undefined,
            nonInteractive: Boolean(opts.nonInteractive),
            json: Boolean(opts.json),
          },
          defaultRuntime,
          { hasFlags },
        );
      });
    });

  agents
    .command("set-identity")
    .description("Update an agent identity (name/theme/emoji/avatar)")
    .option("--agent <id>", "Agent id to update")
    .option("--workspace <dir>", "Workspace directory used to locate the agent + IDENTITY.md")
    .option("--identity-file <path>", "Explicit IDENTITY.md path to read")
    .option("--from-identity", "Read values from IDENTITY.md", false)
    .option("--name <name>", "Identity name")
    .option("--theme <theme>", "Identity theme")
    .option("--emoji <emoji>", "Identity emoji")
    .option("--avatar <value>", "Identity avatar (workspace path, http(s) URL, or data URI)")
    .option("--json", "Output JSON summary", false)
    .addHelpText(
      "after",
      () =>
        `
${theme.heading("Examples:")}
${formatHelpExamples([
  ['openclaw agents set-identity --agent main --name "OpenClaw" --emoji "🦞"', "Set name + emoji."],
  ["openclaw agents set-identity --agent main --avatar avatars/openclaw.png", "Set avatar path."],
  [
    "openclaw agents set-identity --workspace ~/.openclaw/workspace --from-identity",
    "Load from IDENTITY.md.",
  ],
  [
    "openclaw agents set-identity --identity-file ~/.openclaw/workspace/IDENTITY.md --agent main",
    "Use a specific IDENTITY.md.",
  ],
])}
`,
    )
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await agentsSetIdentityCommand(
          {
            agent: opts.agent as string | undefined,
            workspace: opts.workspace as string | undefined,
            identityFile: opts.identityFile as string | undefined,
            fromIdentity: Boolean(opts.fromIdentity),
            name: opts.name as string | undefined,
            theme: opts.theme as string | undefined,
            emoji: opts.emoji as string | undefined,
            avatar: opts.avatar as string | undefined,
            json: Boolean(opts.json),
          },
          defaultRuntime,
        );
      });
    });

  agents
    .command("delete <id>")
    .description("Delete an agent and prune workspace/state")
    .option("--force", "Skip confirmation", false)
    .option("--json", "Output JSON summary", false)
    .action(async (id, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await agentsDeleteCommand(
          {
            id: String(id),
            force: Boolean(opts.force),
            json: Boolean(opts.json),
          },
          defaultRuntime,
        );
      });
    });

  agents.action(async () => {
    await runCommandWithRuntime(defaultRuntime, async () => {
      await agentsListCommand({}, defaultRuntime);
    });
  });

  // Provisioning commands
  const provisioning = program
    .command("provisioning")
    .description("Manage provisioning keys for automated agent creation")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/provisioning", "docs.openclaw.ai/cli/provisioning")}\n`,
    );

  // AI Provider provisioning keys
  const aiProviders = provisioning
    .command("ai-providers")
    .description("Manage AI provider provisioning keys (master keys for creating agent API keys)");

  aiProviders
    .command("add")
    .description("Add a master AI provider key for provisioning")
    .requiredOption("--provider <name>", "AI provider: anthropic | openai | gemini")
    .requiredOption("--key <key>", "Master API key")
    .option("--name <name>", "Human-readable label for this key")
    .option("--expires <duration>", "Expiration duration (e.g., 30d, 1y)")
    .option(
      "--quotas-per-agent <quotas>",
      "Per-agent quotas (e.g., maxTokensPerMonth=1000000,maxRequestsPerDay=1000)",
    )
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await aiProvidersAddCommand(
          {
            provider: opts.provider as "anthropic" | "openai" | "gemini",
            key: opts.key as string,
            name: opts.name as string | undefined,
            expires: opts.expires as string | undefined,
            quotasPerAgent: opts.quotasPerAgent as string | undefined,
          },
          defaultRuntime,
        );
      });
    });

  aiProviders
    .command("list")
    .description("List configured AI provider keys")
    .option("--json", "Output JSON instead of text", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await aiProvidersListCommand({ json: Boolean(opts.json) }, defaultRuntime);
      });
    });

  aiProviders
    .command("revoke <key-id>")
    .description("Revoke an AI provider key")
    .action(async (keyId) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await aiProvidersRevokeCommand({ keyId: String(keyId) }, defaultRuntime);
      });
    });

  // Agent provisioning keys
  const agentKeys = provisioning
    .command("agent-keys")
    .description("Manage agent provisioning keys (authorize agent creation operations)");

  agentKeys
    .command("create")
    .description("Create a new agent provisioning key")
    .requiredOption("--scopes <scopes>", "Comma-separated scopes (agents:create,agents:delete,agents:configure,agents:onboard)")
    .option("--name <name>", "Human-readable label for this key")
    .option("--ai-provider-key <id>", "Link to AI provider key for auto-provisioning")
    .option("--expires <duration>", "Expiration duration (e.g., 30d, 1y)")
    .option("--max-uses <number>", "Maximum number of uses (default: unlimited)")
    .option("--output-key-only", "Output only the key (no additional text)", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await agentKeysCreateCommand(
          {
            scopes: opts.scopes as string,
            name: opts.name as string | undefined,
            aiProviderKey: opts.aiProviderKey as string | undefined,
            expires: opts.expires as string | undefined,
            maxUses: opts.maxUses ? parseInt(opts.maxUses as string, 10) : undefined,
            outputKeyOnly: Boolean(opts.outputKeyOnly),
          },
          defaultRuntime,
        );
      });
    });

  agentKeys
    .command("list")
    .description("List configured agent provisioning keys")
    .option("--json", "Output JSON instead of text", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await agentKeysListCommand({ json: Boolean(opts.json) }, defaultRuntime);
      });
    });

  agentKeys
    .command("revoke <key-id>")
    .description("Revoke an agent provisioning key")
    .action(async (keyId) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await agentKeysRevokeCommand({ keyId: String(keyId) }, defaultRuntime);
      });
    });

  agentKeys
    .command("rotate <key-id>")
    .description("Rotate an agent provisioning key (generates new key value)")
    .action(async (keyId) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await agentKeysRotateCommand({ keyId: String(keyId) }, defaultRuntime);
      });
    });
}
