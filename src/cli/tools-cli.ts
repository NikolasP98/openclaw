import { resolve } from "node:path";
import type { Command } from "commander";
import { loadConfig, readConfigFileSnapshotForWrite, writeConfigFile } from "../config/config.js";
import type { ReadConfigFileSnapshotForWriteResult } from "../config/io.js";
import type { OpenClawConfig } from "../config/types.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { addGatewayClientOptions, callGatewayFromCli, type GatewayRpcOpts } from "./gateway-rpc.js";
import { installTool } from "./tools-cli.install.js";
import { scaffoldTool, runCodegen } from "./tools-cli.scaffold.js";

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

type MutableToolsCfg = {
  profile?: string;
  allow?: string[];
  alsoAllow?: string[];
  deny?: string[];
};

function resolveToolsConfig(
  cfg: OpenClawConfig,
  agentId?: string,
): { tools: MutableToolsCfg; path: string } {
  if (!agentId) {
    const mutable = cfg as { tools?: MutableToolsCfg };
    mutable.tools = mutable.tools ?? {};
    return { tools: mutable.tools, path: "tools" };
  }
  const normalized = normalizeAgentId(agentId);
  const mutable = cfg as {
    agents?: { list?: Array<{ id?: string; tools?: MutableToolsCfg }> };
  };
  mutable.agents = mutable.agents ?? {};
  mutable.agents.list = mutable.agents.list ?? [];
  let agent = mutable.agents.list.find((a) => normalizeAgentId(a.id) === normalized);
  if (!agent) {
    agent = { id: agentId };
    mutable.agents.list.push(agent);
  }
  agent.tools = agent.tools ?? {};
  return { tools: agent.tools, path: `agents[${agentId}].tools` };
}

function removeFromArray(arr: string[] | undefined, value: string): string[] {
  if (!arr) {
    return [];
  }
  return arr.filter((v) => v !== value);
}

async function writeConfigAndReload(
  cfg: OpenClawConfig,
  writeResult: ReadConfigFileSnapshotForWriteResult,
  opts: GatewayRpcOpts,
): Promise<void> {
  await writeConfigFile(cfg, {
    envSnapshotForRestore: writeResult.writeOptions.envSnapshotForRestore,
    expectedConfigPath: writeResult.writeOptions.expectedConfigPath,
  });
  // Best-effort reload — gateway may not be running
  try {
    await callGatewayFromCli("tools.reload", opts, {}, { progress: false });
  } catch {
    // Gateway not running, config still written
  }
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

  // --- enable ---
  tools
    .command("enable")
    .description("Enable a tool or group (adds to alsoAllow, removes from deny)")
    .argument("<name>", "Tool ID or group:name")
    .option("--agent <id>", "Scope to specific agent")
    .action(async (name: string, opts) => {
      const parentOpts = tools.opts();
      const writeResult = await readConfigFileSnapshotForWrite();
      const cfg = loadConfig();
      const { tools: toolsCfg } = resolveToolsConfig(cfg, opts.agent);
      // Remove from deny
      toolsCfg.deny = removeFromArray(toolsCfg.deny, name);
      if (toolsCfg.deny.length === 0) {
        delete toolsCfg.deny;
      }
      // Add to alsoAllow (or allow if that list already exists)
      if (Array.isArray(toolsCfg.allow)) {
        if (!toolsCfg.allow.includes(name)) {
          toolsCfg.allow.push(name);
        }
      } else {
        toolsCfg.alsoAllow = toolsCfg.alsoAllow ?? [];
        if (!toolsCfg.alsoAllow.includes(name)) {
          toolsCfg.alsoAllow.push(name);
        }
      }
      await writeConfigAndReload(cfg, writeResult, parentOpts);
      console.log(`Enabled ${name}${opts.agent ? ` for agent ${opts.agent}` : " (global)"}`);
    });

  // --- disable ---
  tools
    .command("disable")
    .description("Disable a tool or group (adds to deny, removes from alsoAllow)")
    .argument("<name>", "Tool ID or group:name")
    .option("--agent <id>", "Scope to specific agent")
    .action(async (name: string, opts) => {
      const parentOpts = tools.opts();
      const writeResult = await readConfigFileSnapshotForWrite();
      const cfg = loadConfig();
      const { tools: toolsCfg } = resolveToolsConfig(cfg, opts.agent);
      // Remove from alsoAllow
      toolsCfg.alsoAllow = removeFromArray(toolsCfg.alsoAllow, name);
      if (toolsCfg.alsoAllow.length === 0) {
        delete toolsCfg.alsoAllow;
      }
      // Remove from allow if present
      if (Array.isArray(toolsCfg.allow)) {
        toolsCfg.allow = removeFromArray(toolsCfg.allow, name);
        if (toolsCfg.allow.length === 0) {
          delete toolsCfg.allow;
        }
      }
      // Add to deny
      toolsCfg.deny = toolsCfg.deny ?? [];
      if (!toolsCfg.deny.includes(name)) {
        toolsCfg.deny.push(name);
      }
      await writeConfigAndReload(cfg, writeResult, parentOpts);
      console.log(`Disabled ${name}${opts.agent ? ` for agent ${opts.agent}` : " (global)"}`);
    });

  // --- profile ---
  tools
    .command("profile")
    .description("Set the tool profile (minimal, coding, messaging, full)")
    .argument("<profile>", "Profile ID")
    .option("--agent <id>", "Scope to specific agent")
    .action(async (profile: string, opts) => {
      const valid = ["minimal", "coding", "messaging", "full"];
      if (!valid.includes(profile)) {
        console.error(`Invalid profile: ${profile}. Valid: ${valid.join(", ")}`);
        process.exit(1);
      }
      const parentOpts = tools.opts();
      const writeResult = await readConfigFileSnapshotForWrite();
      const cfg = loadConfig();
      const { tools: toolsCfg } = resolveToolsConfig(cfg, opts.agent);
      toolsCfg.profile = profile;
      await writeConfigAndReload(cfg, writeResult, parentOpts);
      console.log(
        `Profile set to ${profile}${opts.agent ? ` for agent ${opts.agent}` : " (global)"}`,
      );
    });

  // --- create ---
  tools
    .command("create")
    .description("Scaffold a new tool (meta.ts + implementation)")
    .argument("<name>", "Tool name in kebab-case (e.g. my-tool)")
    .option(
      "--group <name>",
      "Group to add tool to (repeatable)",
      (v: string, prev: string[]) => {
        const g = v.startsWith("group:") ? v : `group:${v}`;
        return [...prev, g];
      },
      [] as string[],
    )
    .action(async (name: string, opts) => {
      const groups = opts.group.length > 0 ? opts.group : ["group:minion"];
      const toolsDir = resolve(process.cwd(), "src/agents/tools");
      try {
        const { metaPath, implPath } = scaffoldTool({ name, groups, toolsDir });
        console.log(`Created: ${metaPath}`);
        console.log(`Created: ${implPath}`);
        console.log("\nRunning codegen...");
        await runCodegen(process.cwd());
        console.log("\nNext steps:");
        console.log("  1. Implement the tool in the generated .ts file");
        console.log("  2. If the tool needs options from the context bag:");
        console.log("     - Add contextKeys to the meta.ts file");
        console.log("     - Add a case to buildToolOptions() in openclaw-tools.ts");
        console.log("  3. If tool ordering matters, add to TOOL_ORDER in openclaw-tools.ts");
      } catch (err) {
        console.error(String(err));
        process.exit(1);
      }
    });

  // --- install ---
  tools
    .command("install")
    .description("Install dependencies for a tool")
    .argument("<tool-id>", "Tool identifier")
    .action(async (toolId: string) => {
      const parentOpts = tools.opts();
      const data = await fetchToolsStatus(parentOpts);
      const tool = data.tools.find((t) => t.id === toolId);
      if (!tool) {
        console.error(`Unknown tool: ${toolId}`);
        process.exit(1);
      }
      if (!tool.install || tool.install.length === 0) {
        console.log(`Tool ${toolId} has no install instructions.`);
        if (tool.requires?.bins?.length) {
          console.log(`Required binaries: ${tool.requires.bins.join(", ")}`);
        }
        return;
      }
      const result = await installTool(tool.install);
      console.log(result.message);
      if (!result.installed) {
        process.exit(1);
      }
    });
}
