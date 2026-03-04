import { runExec, runCommandWithTimeout } from "../platform/process/exec.js";

type InstallInstruction = {
  kind: string;
  formula?: string;
  bins?: string[];
  label?: string;
};

async function hasBin(bin: string): Promise<boolean> {
  try {
    await runExec("which", [bin], 5_000);
    return true;
  } catch {
    return false;
  }
}

async function detectPackageManager(): Promise<string | undefined> {
  if (await hasBin("brew")) {
    return "brew";
  }
  if (await hasBin("apt-get")) {
    return "apt";
  }
  if (await hasBin("npm")) {
    return "npm";
  }
  return undefined;
}

export async function installTool(instructions: InstallInstruction[]): Promise<{
  installed: boolean;
  message: string;
}> {
  const pm = await detectPackageManager();
  if (!pm) {
    return {
      installed: false,
      message: "No supported package manager found (brew, apt, npm).",
    };
  }

  const match = instructions.find((i) => {
    if (i.kind === pm) {
      return true;
    }
    if (i.kind === "homebrew" && pm === "brew") {
      return true;
    }
    if (i.kind === "brew" && pm === "brew") {
      return true;
    }
    return false;
  });
  if (!match) {
    const kinds = instructions.map((i) => i.kind).join(", ");
    return {
      installed: false,
      message: `No install instruction for ${pm}. Available: ${kinds}`,
    };
  }

  const target = match.formula ?? match.bins?.[0] ?? "";
  if (!target) {
    return { installed: false, message: `Install instruction for ${pm} has no formula or bin.` };
  }

  let argv: string[];
  switch (pm) {
    case "brew":
      argv = ["brew", "install", target];
      break;
    case "apt":
      argv = ["sudo", "apt-get", "install", "-y", target];
      break;
    case "npm":
      argv = ["npm", "install", "-g", target];
      break;
    default:
      return { installed: false, message: `Unsupported package manager: ${pm}` };
  }

  console.log(`Running: ${argv.join(" ")}`);
  const result = await runCommandWithTimeout(argv, { timeoutMs: 120_000 });
  if (result.code !== 0) {
    return { installed: false, message: `Install command failed (exit ${result.code})` };
  }

  // Verify binaries
  const bins = match.bins ?? [];
  for (const bin of bins) {
    if (!(await hasBin(bin))) {
      return { installed: false, message: `Binary not found after install: ${bin}` };
    }
  }

  return { installed: true, message: `Installed successfully via ${pm}` };
}
