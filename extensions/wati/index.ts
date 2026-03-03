import type { MinionPluginApi } from "minion/plugin-sdk";
import { emptyPluginConfigSchema } from "minion/plugin-sdk";
import { watiPlugin } from "./src/channel.js";
import { handleWatiWebhookRequest } from "./src/monitor.js";
import { setWatiRuntime } from "./src/runtime.js";

const plugin = {
  id: "wati",
  name: "WATI WhatsApp",
  description: "WATI WhatsApp Business channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: MinionPluginApi) {
    setWatiRuntime(api.runtime);
    api.registerChannel({ plugin: watiPlugin });
    api.registerHttpHandler(handleWatiWebhookRequest);
  },
};

export default plugin;
