import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyConnectPlan, planConnect } from "../src/connect.js";
import { applyInitializeLibraryPlan, planInitializeLibrary } from "../src/init.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("guided agent connection", () => {
  it("uses the shared library where supported and safely links a separate agent folder", async () => {
    const home = mkdtempSync(join(tmpdir(), "dotagents-connect-home-"));
    roots.push(home);
    const library = join(home, ".agents");
    await applyInitializeLibraryPlan(planInitializeLibrary(library, "personal"));
    mkdirSync(join(library, "skills", "writing"), { recursive: true });
    writeFileSync(
      join(library, "skills", "writing", "SKILL.md"),
      "---\nname: writing\ndescription: Writes clearly.\n---\n# Writing\n",
    );
    writeFileSync(
      join(library, "skills.json"),
      JSON.stringify({
        schema_version: 1,
        name: "personal",
        version: "0.1.0",
        skills: ["skills/writing"],
        dependencies: {},
      }),
    );
    mkdirSync(join(home, ".codex"), { recursive: true });
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(home, ".codex", "config.toml"), "model = 'test'\n");
    writeFileSync(join(home, ".claude", "settings.json"), "{}\n");

    const plan = await planConnect({ root: library, home, platform: "linux", environment: { PATH: "" } });

    expect(plan.summary.agentsFound).toBeGreaterThanOrEqual(2);
    expect(plan.summary.sharedAgents).toContain("Codex");
    expect(plan.summary.linkedAgents).toContain("Claude Code");
    expect(plan.materialization.operations).toContainEqual(
      expect.objectContaining({ agent: "codex", action: "available-native" }),
    );
    expect(plan.materialization.operations).toContainEqual(
      expect.objectContaining({ agent: "claude-code", action: "create-symlink" }),
    );

    const result = await applyConnectPlan(plan);
    expect(result.applied).toBe(1);
    expect(existsSync(join(home, ".claude", "skills", "writing"))).toBe(true);
  });
});
