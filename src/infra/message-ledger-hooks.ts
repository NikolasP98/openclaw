import type { PluginRegistry } from "../plugins/registry.js";
import type {
  PluginHookMessageContext,
  PluginHookMessageInboundEvent,
  PluginHookMessageSentEvent,
} from "../plugins/types.js";
import {
  closeMessageLedger,
  openMessageLedger,
  recordInboundMessage,
  recordOutboundMessage,
} from "./message-ledger.js";

const PLUGIN_ID = "openclaw:message-ledger";

export function registerMessageLedgerHooks(registry: PluginRegistry, dbPath: string): void {
  registry.typedHooks.push(
    {
      pluginId: PLUGIN_ID,
      hookName: "gateway_start",
      handler: () => {
        openMessageLedger(dbPath);
      },
      source: "internal",
    },
    {
      pluginId: PLUGIN_ID,
      hookName: "gateway_stop",
      handler: () => {
        closeMessageLedger();
      },
      source: "internal",
    },
    {
      pluginId: PLUGIN_ID,
      hookName: "message_inbound",
      handler: (event: PluginHookMessageInboundEvent) => {
        recordInboundMessage(event);
      },
      source: "internal",
    },
    {
      pluginId: PLUGIN_ID,
      hookName: "message_sent",
      handler: (event: PluginHookMessageSentEvent, ctx: PluginHookMessageContext) => {
        recordOutboundMessage(event, ctx);
      },
      source: "internal",
    },
  );
}
