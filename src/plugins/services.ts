import type { OpenClawConfig } from "../config/config.js";
import { STATE_DIR } from "../config/paths.js";
import { LazyService } from "../infra/lazy-service.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { PluginRegistry } from "./registry.js";
import type { OpenClawPluginServiceContext, PluginLogger } from "./types.js";

const log = createSubsystemLogger("plugins");

function createPluginLogger(): PluginLogger {
  return {
    info: (msg) => log.info(msg),
    warn: (msg) => log.warn(msg),
    error: (msg) => log.error(msg),
    debug: (msg) => log.debug(msg),
  };
}

function createServiceContext(params: {
  config: OpenClawConfig;
  workspaceDir?: string;
}): OpenClawPluginServiceContext {
  return {
    config: params.config,
    workspaceDir: params.workspaceDir,
    stateDir: STATE_DIR,
    logger: createPluginLogger(),
  };
}

export type PluginServicesHandle = {
  stop: () => Promise<void>;
};

export async function startPluginServices(params: {
  registry: PluginRegistry;
  config: OpenClawConfig;
  workspaceDir?: string;
}): Promise<PluginServicesHandle> {
  const running: Array<{
    id: string;
    stop?: () => void | Promise<void>;
  }> = [];
  const serviceContext = createServiceContext({
    config: params.config,
    workspaceDir: params.workspaceDir,
  });

  for (const entry of params.registry.services) {
    const service = entry.service;
    try {
      await service.start(serviceContext);
      running.push({
        id: service.id,
        stop: service.stop ? () => service.stop?.(serviceContext) : undefined,
      });
    } catch (err) {
      log.error(`plugin service failed (${service.id}): ${String(err)}`);
    }
  }

  return {
    stop: async () => {
      for (const entry of running.toReversed()) {
        if (!entry.stop) {
          continue;
        }
        try {
          await entry.stop();
        } catch (err) {
          log.warn(`plugin service stop failed (${entry.id}): ${String(err)}`);
        }
      }
    },
  };
}

/**
 * Create a lazy plugin services handle that defers service startup to first use.
 *
 * Services are not started at gateway boot — they are initialized the first
 * time `ensureStarted()` is called (typically on first inbound message).
 * This can significantly reduce gateway startup time.
 */
export function createLazyPluginServices(params: {
  registry: PluginRegistry;
  config: OpenClawConfig;
  workspaceDir?: string;
}): LazyPluginServicesHandle {
  const lazy = new LazyService<PluginServicesHandle>({
    name: "plugin-services",
    initializer: () => startPluginServices(params),
  });

  return {
    ensureStarted: () => lazy.get().then(() => {}),
    get initialized() {
      return lazy.initialized;
    },
    stop: async () => {
      if (lazy.initialized) {
        const handle = await lazy.get();
        await handle.stop();
      }
      await lazy.dispose();
    },
  };
}

export type LazyPluginServicesHandle = {
  /** Ensure services are started (no-op if already started). */
  ensureStarted: () => Promise<void>;
  /** Whether services have been initialized. */
  readonly initialized: boolean;
  /** Stop all services (no-op if never started). */
  stop: () => Promise<void>;
};
