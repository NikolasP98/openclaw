import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

async function writeDockerStub(binDir: string, logPath: string) {
  const stub = `#!/usr/bin/env bash
set -euo pipefail
log="$DOCKER_STUB_LOG"
if [[ "\${1:-}" == "compose" && "\${2:-}" == "version" ]]; then
  exit 0
fi
if [[ "\${1:-}" == "build" ]]; then
  echo "build $*" >>"$log"
  exit 0
fi
if [[ "\${1:-}" == "compose" ]]; then
  echo "compose $*" >>"$log"
  exit 0
fi
echo "unknown $*" >>"$log"
exit 0
`;

  await mkdir(binDir, { recursive: true });
  await writeFile(join(binDir, "docker"), stub, { mode: 0o755 });
  await writeFile(logPath, "");
}

/** Copy docker-setup.sh and its shared library into a temp root. */
async function setupTempRoot() {
  const rootDir = await mkdtemp(join(tmpdir(), "openclaw-docker-setup-"));
  const scriptPath = join(rootDir, "docker-setup.sh");
  const dockerfilePath = join(rootDir, "Dockerfile");
  const composePath = join(rootDir, "docker-compose.yml");
  const binDir = join(rootDir, "bin");
  const logPath = join(rootDir, "docker-stub.log");

  const script = await readFile(join(repoRoot, "docker-setup.sh"), "utf8");
  await writeFile(scriptPath, script, { mode: 0o755 });
  await writeFile(dockerfilePath, "FROM scratch\n");

  // Copy shared derivation library
  const libDir = join(rootDir, "scripts", "lib");
  await mkdir(libDir, { recursive: true });
  await cp(
    join(repoRoot, "scripts", "lib", "openclaw-env.sh"),
    join(libDir, "openclaw-env.sh"),
  );

  await writeDockerStub(binDir, logPath);

  return { rootDir, scriptPath, composePath, binDir, logPath };
}

describe("docker-setup.sh", () => {
  it("handles unset optional env vars under strict mode", async () => {
    const assocCheck = spawnSync("bash", ["-c", "declare -A _t=()"], {
      encoding: "utf8",
    });
    if (assocCheck.status !== 0) {
      return;
    }

    const { rootDir, scriptPath, composePath, binDir, logPath } =
      await setupTempRoot();
    await writeFile(
      composePath,
      "services:\n  openclaw-gateway:\n    image: noop\n  openclaw-cli:\n    image: noop\n",
    );

    const env = {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      DOCKER_STUB_LOG: logPath,
      OPENCLAW_GATEWAY_TOKEN: "test-token",
      OPENCLAW_CONFIG_DIR: join(rootDir, "config"),
      OPENCLAW_WORKSPACE_DIR: join(rootDir, "openclaw"),
    };
    delete env.OPENCLAW_DOCKER_APT_PACKAGES;
    delete env.OPENCLAW_EXTRA_MOUNTS;
    delete env.OPENCLAW_HOME_VOLUME;

    const result = spawnSync("bash", [scriptPath], {
      cwd: rootDir,
      env,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);

    const envFile = await readFile(join(rootDir, ".env"), "utf8");
    expect(envFile).toContain("OPENCLAW_DOCKER_APT_PACKAGES=");
    expect(envFile).toContain("OPENCLAW_EXTRA_MOUNTS=");
    expect(envFile).toContain("OPENCLAW_HOME_VOLUME=");
  });

  it("plumbs OPENCLAW_DOCKER_APT_PACKAGES into .env (legacy, ignored by Dockerfile)", async () => {
    // Note: OPENCLAW_DOCKER_APT_PACKAGES is kept for backwards compatibility in docker-setup.sh
    // but the new multi-stage Dockerfile bakes runtime packages (sqlite3, jq, ffmpeg) directly.
    // This test verifies the setup script still passes the env var for any custom builds.
    const assocCheck = spawnSync("bash", ["-c", "declare -A _t=()"], {
      encoding: "utf8",
    });
    if (assocCheck.status !== 0) {
      return;
    }

    const { rootDir, scriptPath, composePath, binDir, logPath } =
      await setupTempRoot();
    await writeFile(
      composePath,
      "services:\n  openclaw-gateway:\n    image: noop\n  openclaw-cli:\n    image: noop\n",
    );

    const env = {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      DOCKER_STUB_LOG: logPath,
      OPENCLAW_DOCKER_APT_PACKAGES: "ffmpeg build-essential",
      OPENCLAW_GATEWAY_TOKEN: "test-token",
      OPENCLAW_CONFIG_DIR: join(rootDir, "config"),
      OPENCLAW_WORKSPACE_DIR: join(rootDir, "openclaw"),
      OPENCLAW_EXTRA_MOUNTS: "",
      OPENCLAW_HOME_VOLUME: "",
    };

    const result = spawnSync("bash", [scriptPath], {
      cwd: rootDir,
      env,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);

    // Env var is still written to .env for backwards compatibility
    const envFile = await readFile(join(rootDir, ".env"), "utf8");
    expect(envFile).toContain(
      "OPENCLAW_DOCKER_APT_PACKAGES=ffmpeg build-essential",
    );

    // Build arg is still passed (but ignored by the new Dockerfile which bakes packages in)
    const log = await readFile(logPath, "utf8");
    expect(log).toContain(
      "--build-arg OPENCLAW_DOCKER_APT_PACKAGES=ffmpeg build-essential",
    );
  });

  it("keeps docker-compose gateway command in sync", async () => {
    const compose = await readFile(
      join(repoRoot, "docker-compose.yml"),
      "utf8",
    );
    expect(compose).not.toContain("gateway-daemon");
    expect(compose).toContain('"gateway"');
  });

  it("parameterizes container names via OPENCLAW_ENV", async () => {
    const assocCheck = spawnSync("bash", ["-c", "declare -A _t=()"], {
      encoding: "utf8",
    });
    if (assocCheck.status !== 0) {
      return;
    }

    const { rootDir, scriptPath, composePath, binDir, logPath } =
      await setupTempRoot();
    const compose = await readFile(
      join(repoRoot, "docker-compose.yml"),
      "utf8",
    );
    await writeFile(composePath, compose);

    const env = {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      DOCKER_STUB_LOG: logPath,
      OPENCLAW_ENV: "test",
      OPENCLAW_GATEWAY_TOKEN: "test-token",
      OPENCLAW_CONFIG_DIR: join(rootDir, "config"),
      OPENCLAW_WORKSPACE_DIR: join(rootDir, "openclaw"),
      OPENCLAW_EXTRA_MOUNTS: "",
      OPENCLAW_HOME_VOLUME: "",
    };

    const result = spawnSync("bash", [scriptPath], {
      cwd: rootDir,
      env,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);

    const envFile = await readFile(join(rootDir, ".env"), "utf8");
    expect(envFile).toContain("OPENCLAW_ENV=test");
    expect(envFile).toContain(
      "OPENCLAW_GATEWAY_CONTAINER_NAME=openclaw_test_gw",
    );
    expect(envFile).toContain("OPENCLAW_CLI_CONTAINER_NAME=openclaw_test_cli");
  });

  it("forces OPENCLAW_ENV to lowercase", async () => {
    const assocCheck = spawnSync("bash", ["-c", "declare -A _t=()"], {
      encoding: "utf8",
    });
    if (assocCheck.status !== 0) {
      return;
    }

    const { rootDir, scriptPath, composePath, binDir, logPath } =
      await setupTempRoot();
    await writeFile(
      composePath,
      "services:\n  openclaw-gateway:\n    image: noop\n  openclaw-cli:\n    image: noop\n",
    );

    const env = {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      DOCKER_STUB_LOG: logPath,
      OPENCLAW_ENV: "PRD",
      OPENCLAW_GATEWAY_TOKEN: "test-token",
      OPENCLAW_CONFIG_DIR: join(rootDir, "config"),
      OPENCLAW_WORKSPACE_DIR: join(rootDir, "openclaw"),
      OPENCLAW_EXTRA_MOUNTS: "",
      OPENCLAW_HOME_VOLUME: "",
    };

    const result = spawnSync("bash", [scriptPath], {
      cwd: rootDir,
      env,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);

    const envFile = await readFile(join(rootDir, ".env"), "utf8");
    expect(envFile).toContain("OPENCLAW_ENV=prd");
    expect(envFile).toContain(
      "OPENCLAW_GATEWAY_CONTAINER_NAME=openclaw_prd_gw",
    );
    expect(envFile).toContain("OPENCLAW_CLI_CONTAINER_NAME=openclaw_prd_cli");
  });

  it("derives tenant-aware container names and paths", async () => {
    const assocCheck = spawnSync("bash", ["-c", "declare -A _t=()"], {
      encoding: "utf8",
    });
    if (assocCheck.status !== 0) {
      return;
    }

    const { rootDir, scriptPath, composePath, binDir, logPath } =
      await setupTempRoot();
    await writeFile(
      composePath,
      "services:\n  openclaw-gateway:\n    image: noop\n  openclaw-cli:\n    image: noop\n",
    );

    const env = {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      DOCKER_STUB_LOG: logPath,
      OPENCLAW_ENV: "prd",
      OPENCLAW_TENANT: "faces",
      OPENCLAW_GATEWAY_TOKEN: "test-token",
      OPENCLAW_EXTRA_MOUNTS: "",
      OPENCLAW_HOME_VOLUME: "",
    };
    // Let the library derive CONFIG_DIR and WORKSPACE_DIR from HOME
    delete env.OPENCLAW_CONFIG_DIR;
    delete env.OPENCLAW_WORKSPACE_DIR;

    const result = spawnSync("bash", [scriptPath], {
      cwd: rootDir,
      env,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);

    const envFile = await readFile(join(rootDir, ".env"), "utf8");
    expect(envFile).toContain("OPENCLAW_ENV=prd");
    expect(envFile).toContain("OPENCLAW_TENANT=faces");
    expect(envFile).toContain(
      "OPENCLAW_GATEWAY_CONTAINER_NAME=openclaw_prd_faces_gw",
    );
    expect(envFile).toContain(
      "OPENCLAW_CLI_CONTAINER_NAME=openclaw_prd_faces_cli",
    );
    // docker-setup.sh defaults OPENCLAW_IMAGE to openclaw:local (local build)
    expect(envFile).toContain("OPENCLAW_IMAGE=openclaw:local");
    // Config dir should use hyphen separator
    expect(envFile).toMatch(/OPENCLAW_CONFIG_DIR=.*\.openclaw-prd-faces/);
    expect(envFile).toMatch(
      /OPENCLAW_WORKSPACE_DIR=.*\.openclaw-prd-faces\/workspace/,
    );
  });
});
