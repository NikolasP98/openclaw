import { describe, expect, it, vi } from "vitest";

vi.mock("./embedded-templates.generated.js", () => ({
  EMBEDDED_TEMPLATES: {
    "BOOTSTRAP.md": "# Embedded Bootstrap\nFallback content.",
    "AGENTS.md": "# Embedded Agents\nDefault agents config.",
  },
}));

vi.mock("../infra/minion-root.js", () => ({
  resolveMinionPackageRoot: vi.fn().mockResolvedValue(null),
}));

vi.mock("../utils.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../utils.js")>();
  return {
    ...original,
    pathExists: vi.fn().mockResolvedValue(false),
  };
});

import { readWorkspaceTemplate } from "./workspace-templates.js";

describe("readWorkspaceTemplate", () => {
  it("returns embedded template when filesystem is unavailable", async () => {
    const content = await readWorkspaceTemplate("BOOTSTRAP.md");
    expect(content).toBeDefined();
    expect(content).toContain("Embedded Bootstrap");
  });

  it("returns embedded AGENTS.md", async () => {
    const content = await readWorkspaceTemplate("AGENTS.md");
    expect(content).toContain("Embedded Agents");
  });

  it("returns undefined for unknown template", async () => {
    const content = await readWorkspaceTemplate("NONEXISTENT.md");
    expect(content).toBeUndefined();
  });
});
