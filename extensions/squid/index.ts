import type {
  AnyAgentTool,
  MinionPluginApi,
  MinionPluginToolFactory,
} from "../../src/plugins/types.js";
import { createSquidTool } from "./src/squid-tool.js";

export default function register(api: MinionPluginApi) {
  api.registerTool(
    ((ctx) => {
      if (ctx.sandboxed) {
        return null;
      }
      return createSquidTool(api) as AnyAgentTool;
    }) as MinionPluginToolFactory,
    { optional: true },
  );
}
