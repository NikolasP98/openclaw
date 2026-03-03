import type { Command } from "commander";
import { healthCommand } from "../../cli/commands/health.js";
import { roiCommand } from "../../cli/commands/roi.js";
import { sessionsCommand } from "../../cli/commands/sessions.js";
import { statusCommand } from "../../cli/commands/status.js";
import { undoCommand } from "../../cli/commands/undo.js";
import { setVerbose } from "../../globals.js";
import { defaultRuntime } from "../../runtime.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { formatHelpExamples } from "../help-format.js";
import { parsePositiveIntOrUndefined } from "./helpers.js";

function resolveVerbose(opts: { verbose?: boolean; debug?: boolean }): boolean {
  return Boolean(opts.verbose || opts.debug);
}

function parseTimeoutMs(timeout: unknown): number | null | undefined {
  const parsed = parsePositiveIntOrUndefined(timeout);
  if (timeout !== undefined && parsed === undefined) {
    defaultRuntime.error("--timeout must be a positive integer (milliseconds)");
    defaultRuntime.exit(1);
    return null;
  }
  return parsed;
}

export function registerStatusHealthSessionsCommands(program: Command) {
  program
    .command("status")
    .description("Show channel health and recent session recipients")
    .option("--json", "Output JSON instead of text", false)
    .option("--all", "Full diagnosis (read-only, pasteable)", false)
    .option("--usage", "Show model provider usage/quota snapshots", false)
    .option("--deep", "Probe channels (WhatsApp Web + Telegram + Discord + Slack + Signal)", false)
    .option("--timeout <ms>", "Probe timeout in milliseconds", "10000")
    .option("--verbose", "Verbose logging", false)
    .option("--debug", "Alias for --verbose", false)
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          ["minion status", "Show channel health + session summary."],
          ["minion status --all", "Full diagnosis (read-only)."],
          ["minion status --json", "Machine-readable output."],
          ["minion status --usage", "Show model provider usage/quota snapshots."],
          [
            "minion status --deep",
            "Run channel probes (WA + Telegram + Discord + Slack + Signal).",
          ],
          ["minion status --deep --timeout 5000", "Tighten probe timeout."],
        ])}`,
    )
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/status", "docs.minion.ai/cli/status")}\n`,
    )
    .action(async (opts) => {
      const verbose = resolveVerbose(opts);
      setVerbose(verbose);
      const timeout = parseTimeoutMs(opts.timeout);
      if (timeout === null) {
        return;
      }
      await runCommandWithRuntime(defaultRuntime, async () => {
        await statusCommand(
          {
            json: Boolean(opts.json),
            all: Boolean(opts.all),
            deep: Boolean(opts.deep),
            usage: Boolean(opts.usage),
            timeoutMs: timeout,
            verbose,
          },
          defaultRuntime,
        );
      });
    });

  program
    .command("health")
    .description("Fetch health from the running gateway")
    .option("--json", "Output JSON instead of text", false)
    .option("--timeout <ms>", "Connection timeout in milliseconds", "10000")
    .option("--verbose", "Verbose logging", false)
    .option("--debug", "Alias for --verbose", false)
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/health", "docs.minion.ai/cli/health")}\n`,
    )
    .action(async (opts) => {
      const verbose = resolveVerbose(opts);
      setVerbose(verbose);
      const timeout = parseTimeoutMs(opts.timeout);
      if (timeout === null) {
        return;
      }
      await runCommandWithRuntime(defaultRuntime, async () => {
        await healthCommand(
          {
            json: Boolean(opts.json),
            timeoutMs: timeout,
            verbose,
          },
          defaultRuntime,
        );
      });
    });

  program
    .command("sessions")
    .description("List stored conversation sessions")
    .option("--json", "Output as JSON", false)
    .option("--verbose", "Verbose logging", false)
    .option("--store <path>", "Path to session store (default: resolved from config)")
    .option("--active <minutes>", "Only show sessions updated within the past N minutes")
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          ["minion sessions", "List all sessions."],
          ["minion sessions --active 120", "Only last 2 hours."],
          ["minion sessions --json", "Machine-readable output."],
          ["minion sessions --store ./tmp/sessions.json", "Use a specific session store."],
        ])}\n\n${theme.muted(
          "Shows token usage per session when the agent reports it; set agents.defaults.contextTokens to cap the window and show %.",
        )}`,
    )
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/sessions", "docs.minion.ai/cli/sessions")}\n`,
    )
    .action(async (opts) => {
      setVerbose(Boolean(opts.verbose));
      await sessionsCommand(
        {
          json: Boolean(opts.json),
          store: opts.store as string | undefined,
          active: opts.active as string | undefined,
        },
        defaultRuntime,
      );
    });

  program
    .command("undo")
    .description("Undo recent tool-call actions (file writes, deletes, etc.)")
    .option("--list", "Show undo history without undoing anything", false)
    .option("--all", "Undo all available actions", false)
    .option("--id <actionId>", "Undo a specific action by ID")
    .option("--json", "Output as JSON", false)
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          ["minion undo", "Undo the last action."],
          ["minion undo --list", "Show undo history."],
          ["minion undo --all", "Undo all available actions."],
          ["minion undo --id abc123", "Undo a specific action by ID."],
        ])}`,
    )
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await undoCommand(
          {
            list: Boolean(opts.list),
            all: Boolean(opts.all),
            id: opts.id as string | undefined,
            json: Boolean(opts.json),
          },
          defaultRuntime,
        );
      });
    });

  program
    .command("roi")
    .description("Calculate ROI for AI agent automation")
    .requiredOption("--hours <n>", "Hours of human work automated per month")
    .option("--occupation <id>", "BLS occupation ID for wage lookup (default: software_developer)")
    .option("--rate <dollars>", "Custom hourly rate override (skips BLS lookup)")
    .option("--api-cost <dollars>", "Monthly AI API cost in USD (default: 0)")
    .option("--infra-cost <dollars>", "Monthly infrastructure cost in USD (default: 0)")
    .option("--list-occupations", "List available occupation IDs with titles and wages", false)
    .option("--json", "Output as JSON", false)
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          ["minion roi --hours 40 --api-cost 200", "ROI for 40h/month automation."],
          ["minion roi --hours 20 --rate 75 --api-cost 100", "Custom hourly rate."],
          ["minion roi --list-occupations", "Show available occupation IDs."],
          [
            "minion roi --hours 40 --occupation customer_support --api-cost 50",
            "ROI for support automation.",
          ],
        ])}`,
    )
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await roiCommand(
          {
            hours: opts.hours as string | undefined,
            occupation: opts.occupation as string | undefined,
            rate: opts.rate as string | undefined,
            apiCost: opts.apiCost as string | undefined,
            infraCost: opts.infraCost as string | undefined,
            listOccupations: Boolean(opts.listOccupations),
            json: Boolean(opts.json),
          },
          defaultRuntime,
        );
      });
    });
}
