/**
 * Pre-compile bundled extensions to JavaScript.
 *
 * During development, extensions are loaded from TypeScript source via jiti,
 * which invokes Babel on every CLI invocation (~15-25 s overhead).
 *
 * This script bundles each extension into a single `index.js` next to its
 * `index.ts`, with the `openclaw/plugin-sdk` import resolved to the built
 * dist output.  The plugin discovery layer then prefers the `.js` file in
 * production, eliminating jiti/Babel overhead entirely.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const EXTENSIONS_DIR = path.join(ROOT, "extensions");
const PLUGIN_SDK_DIST = path.join(ROOT, "dist", "plugin-sdk", "index.js");

if (!fs.existsSync(PLUGIN_SDK_DIST)) {
  console.error("[build-extensions] dist/plugin-sdk/index.js not found — run the main build first");
  process.exit(1);
}

const dirs = fs
  .readdirSync(EXTENSIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

let built = 0;
let skipped = 0;

for (const name of dirs) {
  const extDir = path.join(EXTENSIONS_DIR, name);
  const indexTs = path.join(extDir, "index.ts");

  if (!fs.existsSync(indexTs)) {
    skipped++;
    continue;
  }

  try {
    execSync(
      [
        "node_modules/.bin/tsdown",
        `--entry ${JSON.stringify(indexTs)}`,
        `--out-dir ${JSON.stringify(extDir)}`,
        "--platform node",
        "--no-dts",
        "--no-clean",
        "--silent",
        `--alias.openclaw/plugin-sdk=${JSON.stringify(PLUGIN_SDK_DIST)}`,
      ].join(" "),
      { cwd: ROOT, stdio: "pipe" },
    );
    built++;
  } catch (err) {
    const msg =
      err instanceof Error
        ? ((err as Error & { stderr?: Buffer }).stderr?.toString() ?? err.message)
        : String(err);
    console.error(`[build-extensions] FAILED ${name}: ${msg.slice(0, 200)}`);
  }
}

console.log(`[build-extensions] ${built} compiled, ${skipped} skipped`);
