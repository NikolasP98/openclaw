import type { Command } from "commander";
import { addGatewayClientOptions, callGatewayFromCli, type GatewayRpcOpts } from "./gateway-rpc.js";

type ToolStatusEntry = {
  id: string;
  groups: string[];
  requires?: { bins?: string[]; env?: string[] };
  install?: Array<{ kind: string; formula?: string; bins?: string[]; label?: string }>;
  optional?: boolean;
  mcpExport?: boolean;
  multi?: boolean;
  condition?: string;
  enabled: boolean;
};

type ToolsStatusResult = {
  tools: ToolStatusEntry[];
  groups: Record<string, string[]>;
  profile: string;
};

async function fetchToolsStatus(
  opts: GatewayRpcOpts,
  agentId?: string,
): Promise<ToolsStatusResult> {
  const result = await callGatewayFromCli("tools.status", opts, agentId ? { agentId } : {}, {
    progress: true,
  });
  return result as unknown as ToolsStatusResult;
}

export function registerToolsCli(program: Command) {
  const tools = program
    .command("tools")
    .description("Manage tool policies, status, and scaffolding");

  addGatewayClientOptions(tools);

  // --- list ---
  tools
    .command("list")
    .description("List all tools with enabled/disabled state")
    .option("--agent <id>", "Scope to agent")
    .option("--group <name>", "Filter by group (e.g. gog, web, sessions)")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const parentOpts = tools.opts();
      const data = await fetchToolsStatus({ ...parentOpts, ...opts }, opts.agent);
      let entries = data.tools;
      if (opts.group) {
        const groupKey = opts.group.startsWith("group:") ? opts.group : `group:${opts.group}`;
        const groupTools = new Set(data.groups[groupKey] ?? []);
        entries = entries.filter((t) => groupTools.has(t.id));
      }
      if (opts.json) {
        console.log(JSON.stringify({ profile: data.profile, tools: entries }, null, 2));
        return;
      }
      console.log(`Profile: ${data.profile}\n`);
      const maxId = Math.max(4, ...entries.map((t) => t.id.length));
      console.log(`${"TOOL".padEnd(maxId)}  ENABLED  GROUPS`);
      console.log(`${"─".repeat(maxId)}  ───────  ──────`);
      for (const t of entries) {
        const status = t.enabled ? "  yes  " : "  no   ";
        const groups = t.groups.map((g) => g.replace("group:", "")).join(", ");
        console.log(`${t.id.padEnd(maxId)}  ${status}  ${groups}`);
      }
    });

  // --- status ---
  tools
    .command("status")
    .description("Show detailed status for a single tool")
    .argument("<tool-id>", "Tool identifier")
    .option("--agent <id>", "Scope to agent")
    .option("--json", "JSON output")
    .action(async (toolId: string, opts) => {
      const parentOpts = tools.opts();
      const data = await fetchToolsStatus({ ...parentOpts, ...opts }, opts.agent);
      const tool = data.tools.find((t) => t.id === toolId);
      if (!tool) {
        console.error(`Unknown tool: ${toolId}`);
        console.error(`Available: ${data.tools.map((t) => t.id).join(", ")}`);
        process.exit(1);
      }
      if (opts.json) {
        console.log(JSON.stringify(tool, null, 2));
        return;
      }
      console.log(`Tool:      ${tool.id}`);
      console.log(`Enabled:   ${tool.enabled ? "yes" : "no"}`);
      console.log(
        `Groups:    ${tool.groups.map((g) => g.replace("group:", "")).join(", ") || "(none)"}`,
      );
      if (tool.requires?.bins?.length) {
        console.log(`Requires:  ${tool.requires.bins.join(", ")}`);
      }
      if (tool.requires?.env?.length) {
        console.log(`Env vars:  ${tool.requires.env.join(", ")}`);
      }
      if (tool.condition) {
        console.log(`Condition: ${tool.condition}`);
      }
      if (tool.install?.length) {
        console.log(`Install:`);
        for (const inst of tool.install) {
          console.log(
            `  ${inst.label ?? inst.kind}: ${inst.formula ?? inst.bins?.join(", ") ?? ""}`,
          );
        }
      }
    });

  // --- groups ---
  tools
    .command("groups")
    .description("List all tool groups and their members")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const parentOpts = tools.opts();
      const data = await fetchToolsStatus({ ...parentOpts, ...opts });
      if (opts.json) {
        console.log(JSON.stringify(data.groups, null, 2));
        return;
      }
      for (const [group, members] of Object.entries(data.groups)) {
        console.log(`${group.replace("group:", "")}:`);
        for (const member of members) {
          console.log(`  ${member}`);
        }
        console.log();
      }
    });

  // --- reload ---
  tools
    .command("reload")
    .description("Reload tool policies from config (no gateway restart needed)")
    .action(async () => {
      const parentOpts = tools.opts();
      try {
        const result = await callGatewayFromCli("tools.reload", parentOpts, {}, { progress: true });
        const data = result as unknown as { reloaded: boolean; profile: string };
        console.log(`Config reloaded. Active profile: ${data.profile}`);
      } catch (err) {
        console.error(`Reload failed: ${String(err)}`);
        process.exit(1);
      }
    });
}
