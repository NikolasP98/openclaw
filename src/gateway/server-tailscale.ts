import {
  disableTailscaleFunnel,
  disableTailscaleServe,
  enableTailscaleFunnel,
  enableTailscaleServe,
  enableTailscaleServeFunnel,
  getTailnetHostname,
} from "../infra/tailscale.js";

export async function startGatewayTailscaleExposure(params: {
  tailscaleMode: "off" | "serve" | "funnel";
  enableFunnel?: boolean;
  resetOnExit?: boolean;
  port: number;
  controlUiBasePath?: string;
  logTailscale: { info: (msg: string) => void; warn: (msg: string) => void };
}): Promise<(() => Promise<void>) | null> {
  if (params.tailscaleMode === "off") {
    return null;
  }

  try {
    if (params.tailscaleMode === "serve") {
      await enableTailscaleServe(params.port);
      if (params.enableFunnel) {
        await enableTailscaleServeFunnel();
      }
    } else {
      await enableTailscaleFunnel(params.port);
    }
    const host = await getTailnetHostname().catch(() => null);
    if (host) {
      const uiPath = params.controlUiBasePath ? `${params.controlUiBasePath}/` : "/";
      const funnelNote = params.enableFunnel ? " (funnel on)" : "";
      params.logTailscale.info(
        `${params.tailscaleMode} enabled${funnelNote}: https://${host}${uiPath} (WS via wss://${host})`,
      );
    } else {
      params.logTailscale.info(`${params.tailscaleMode} enabled`);
    }
  } catch (err) {
    params.logTailscale.warn(
      `${params.tailscaleMode} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!params.resetOnExit) {
    return null;
  }

  return async () => {
    try {
      if (params.tailscaleMode === "serve") {
        await disableTailscaleServe();
      } else {
        await disableTailscaleFunnel();
      }
    } catch (err) {
      params.logTailscale.warn(
        `${params.tailscaleMode} cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };
}
