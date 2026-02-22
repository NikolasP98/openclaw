import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const dockerfilePath = join(repoRoot, "Dockerfile");

describe("Dockerfile", () => {
  it("supports optional apt packages via MINION_DOCKER_APT_PACKAGES before pnpm install", async () => {
    const dockerfile = await readFile(dockerfilePath, "utf8");
    const aptArgIndex = dockerfile.indexOf("ARG MINION_DOCKER_APT_PACKAGES");
    const installIndex = dockerfile.indexOf("RUN pnpm install --frozen-lockfile");

    expect(aptArgIndex).toBeGreaterThan(-1);
    expect(installIndex).toBeGreaterThan(-1);
    // apt packages are installed at the system level before the pnpm install layer
    expect(aptArgIndex).toBeLessThan(installIndex);
    // The variable must actually be used in an apt-get RUN command, not just declared
    expect(dockerfile).toMatch(
      /apt-get install[^\n]*\n(?:[^\n]*\n)*[^\n]*\$MINION_DOCKER_APT_PACKAGES/,
    );
  });
});
