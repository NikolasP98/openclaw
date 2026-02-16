import { describe, expect, it } from "vitest";
import type { BrowserServerState } from "./server-context.js";
import { resolveBrowserConfig, resolveProfile } from "./config.js";
import { listKnownProfileNames } from "./server-context.js";

describe("browser server-context listKnownProfileNames", () => {
  it("includes configured and runtime-only profile names", () => {
    const resolved = resolveBrowserConfig({
      defaultProfile: "minion",
      profiles: {
        minion: { cdpPort: 18800, color: "#FF4500" },
      },
    });
    const minion = resolveProfile(resolved, "minion");
    if (!minion) {
      throw new Error("expected minion profile");
    }

    const state: BrowserServerState = {
      server: null as unknown as BrowserServerState["server"],
      port: 18791,
      resolved,
      profiles: new Map([
        [
          "stale-removed",
          {
            profile: { ...minion, name: "stale-removed" },
            running: null,
          },
        ],
      ]),
    };

    expect(listKnownProfileNames(state).toSorted()).toEqual(["chrome", "minion", "stale-removed"]);
  });
});
