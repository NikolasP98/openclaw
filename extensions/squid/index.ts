import type {
  AnyAgentTool,
  MinionPluginApi,
  MinionPluginToolFactory,
} from "../../src/plugins/types.js";
import { createLobsterTool } from "./src/squid-tool.js";

export default function register(api: MinionPluginApi) {
  api.registerTool(
    ((ctx) => {
      if (ctx.sandboxed) {
        return null;
      }
      return createLobsterTool(api) as AnyAgentTool;
    }) as MinionPluginToolFactory,
    { optional: true },
  );
}
