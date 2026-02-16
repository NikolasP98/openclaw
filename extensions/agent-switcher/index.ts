import type { MinionPluginApi } from "minion/plugin-sdk";
import { execSync } from "node:child_process";
import path from "node:path";

const SCRIPTS_DIR = path.join(process.env.HOME ?? "/home/bot-prd", ".minion", "scripts");

export default function register(api: MinionPluginApi) {
  api.registerCommand({
    name: "agent",
    description: "Switch which agent handles your messages.",
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx) => {
      const targetAgent = ctx.args?.trim() ?? "";
      const peerId = ctx.from ?? ctx.senderId;

      if (!peerId) {
        return { text: "Could not identify your sender ID." };
      }

      // No args → list available agents and current bindings
      if (!targetAgent) {
        try {
          const output = execSync(path.join(SCRIPTS_DIR, "list-agents.sh"), {
            encoding: "utf-8",
            timeout: 5000,
          });
          return { text: output.trim() };
        } catch (err) {
          return {
            text: `Error listing agents: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      }

      // Switch agent
      try {
        const output = execSync(
          `${path.join(SCRIPTS_DIR, "switch-agent.sh")} "${peerId}" "${targetAgent}"`,
          { encoding: "utf-8", timeout: 5000 },
        );
        return { text: output.trim() };
      } catch (err) {
        // execSync throws on non-zero exit; stderr is in the error message
        const msg = err instanceof Error ? (err as any).stderr || err.message : String(err);
        return { text: msg.trim() };
      }
    },
  });
}
