import fs from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { resolveStateDir } from "../../config/paths.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { ensureAuthProfileStore, saveAuthProfileStore } from "./store.js";
import type { OAuthCredential } from "./types.js";

const log = createSubsystemLogger("auth/google-bridge");

/**
 * Scan gog-credentials directories for each agent and sync valid Google
 * OAuth credentials into auth-profiles.json. Only creates profiles that
 * don't already exist (non-breaking bridge).
 *
 * This bridges the separate Google credential system (per-session files
 * at ~/.minion/agents/{agentId}/gog-credentials/) with the unified
 * auth-profiles store.
 */
export async function syncGoogleCredentialsToAuthStore(): Promise<number> {
  let synced = 0;

  try {
    const stateDir = resolveStateDir(process.env);
    const agentsDir = path.join(stateDir, "agents");

    if (!fs.existsSync(agentsDir)) {
      return 0;
    }

    const agentDirs = await readdir(agentsDir, { withFileTypes: true });

    for (const agentEntry of agentDirs) {
      if (!agentEntry.isDirectory()) {
        continue;
      }

      // Scan both new (auth-credentials/google/) and legacy (gog-credentials/) paths
      const newDir = path.join(agentsDir, agentEntry.name, "auth-credentials", "google");
      const gogDir = path.join(agentsDir, agentEntry.name, "gog-credentials");
      const dirsToScan = [newDir, gogDir].filter((d) => fs.existsSync(d));
      if (dirsToScan.length === 0) {
        continue;
      }

      try {
        const allFiles: string[] = [];
        const seenFilenames = new Set<string>();
        for (const dir of dirsToScan) {
          for (const f of await readdir(dir)) {
            if (f.endsWith(".json") && !seenFilenames.has(f)) {
              seenFilenames.add(f);
              allFiles.push(path.join(dir, f));
            }
          }
        }
        const files = allFiles;

        for (const credPath of files) {
          try {
            const raw = JSON.parse(await readFile(credPath, "utf-8"));

            if (!raw.accessToken || !raw.refreshToken || !raw.email) {
              continue;
            }

            // Build a profile ID that won't collide with existing ones
            const profileId = `google-workspace:${raw.email}`;
            const store = ensureAuthProfileStore();

            // Only create if it doesn't already exist
            if (store.profiles[profileId]) {
              continue;
            }

            const credential: OAuthCredential = {
              type: "oauth",
              provider: "google-workspace",
              access: raw.accessToken,
              refresh: raw.refreshToken,
              expires: raw.expiresAt ?? 0,
              email: raw.email,
            };

            store.profiles[profileId] = credential;
            saveAuthProfileStore(store);
            synced++;

            log.info("bridged Google credential to auth-profiles", {
              profileId,
              email: raw.email,
              agentId: agentEntry.name,
            });
          } catch (err) {
            log.warn("failed to bridge Google credential file", {
              file: credPath,
              agentId: agentEntry.name,
              err: String(err),
            });
          }
        }
      } catch (err) {
        log.warn("failed to scan Google credentials dirs", {
          agentId: agentEntry.name,
          err: String(err),
        });
      }
    }
  } catch (err) {
    log.warn("Google credential bridge scan failed", { err: String(err) });
  }

  if (synced > 0) {
    log.info(`bridged ${synced} Google credential(s) to auth-profiles`);
  }

  return synced;
}
