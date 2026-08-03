import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentDescriptor } from "../src/agents.js";
import { applyMaterializationPlan, readMaterializationState, recoverMaterialization } from "../src/materialize-apply.js";
import { scanLibrary, type LibraryInventory } from "../src/inventory.js";
import { planMaterialization } from "../src/materialize.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

const linkAgent: AgentDescriptor = {
  slug: "test-agent", displayName: "Test Agent", platforms: ["darwin", "linux", "win32"], detection: [],
  skills: [{ kind: "per-skill-link", roots: ["unused"] }],
};
const copyAgent: AgentDescriptor = { ...linkAgent, slug: "copy-agent", skills: [{ kind: "copy-only", roots: ["unused"] }] };

async function fixture(): Promise<{ library: string; targetRoot: string; inventory: LibraryInventory }> {
  const root = mkdtempSync(join(tmpdir(), "dotagent-apply-"));
  roots.push(root);
  const library = join(root, "library");
  const targetRoot = join(root, "targets");
  mkdirSync(join(library, "skills/writing"), { recursive: true });
  writeFileSync(join(library, "skills/writing/SKILL.md"), "# Writing\n");
  writeFileSync(join(library, "skills.json"), JSON.stringify({ schema_version: 1, name: "personal", version: "1.0.0", skills: ["skills/writing"], dependencies: {} }));
  const scanned = await scanLibrary(library);
  if (!scanned.ok) throw new Error("fixture scan failed");
  return { library, targetRoot, inventory: scanned.value };
}

describe("materialization apply", () => {
  it("creates a reviewed managed link and records local ownership", async () => {
    const { library, targetRoot, inventory } = await fixture();
    const mode = process.platform === "win32" ? "junction" as const : "symlink" as const;
    const plan = planMaterialization(inventory, [{ descriptor: linkAgent, platform: process.platform as "darwin" | "linux" | "win32", detected: true, mode, root: targetRoot, existing: {} }]);
    const result = await applyMaterializationPlan(plan);
    const target = join(targetRoot, "writing");
    expect(result.applied).toBe(1);
    expect(realpathSync(target)).toBe(realpathSync(join(library, "skills/writing")));
    expect((await readMaterializationState(library)).targets[target]).toMatchObject({ agent: "test-agent", skill: "writing" });
  });

  it("rolls back earlier writes when a later operation fails", async () => {
    const { library, targetRoot, inventory } = await fixture();
    const duplicated = { ...inventory, ownedSkills: [
      ...inventory.ownedSkills,
      { ...inventory.ownedSkills[0]!, name: "second", path: "skills/writing" },
    ] };
    const plan = planMaterialization(duplicated, [{ descriptor: copyAgent, platform: process.platform as "darwin" | "linux" | "win32", detected: true, mode: "copy", root: targetRoot, existing: {} }]);
    await expect(applyMaterializationPlan(plan, { beforeOperation: (_operation, index) => { if (index === 1) throw new Error("simulated failure"); } })).rejects.toThrow("simulated failure");
    expect(existsSync(join(targetRoot, "writing"))).toBe(false);
    expect(existsSync(join(targetRoot, "second"))).toBe(false);
    expect((await readMaterializationState(library)).targets).toEqual({});
  });

  it("rejects a changed source before writing any target", async () => {
    const { library, targetRoot, inventory } = await fixture();
    const plan = planMaterialization(inventory, [{ descriptor: copyAgent, platform: process.platform as "darwin" | "linux" | "win32", detected: true, mode: "copy", root: targetRoot, existing: {} }]);
    writeFileSync(join(library, "skills/writing/SKILL.md"), "# Changed\n");
    await expect(applyMaterializationPlan(plan)).rejects.toThrow("Source changed after review");
    expect(existsSync(join(targetRoot, "writing"))).toBe(false);
  });

  it("creates a copy with a marker that does not alter content integrity", async () => {
    const { library, targetRoot, inventory } = await fixture();
    const plan = planMaterialization(inventory, [{ descriptor: copyAgent, platform: process.platform as "darwin" | "linux" | "win32", detected: true, mode: "copy", root: targetRoot, existing: {} }]);
    await applyMaterializationPlan(plan);
    expect(readFileSync(join(targetRoot, "writing/SKILL.md"), "utf8")).toBe("# Writing\n");
    const targetScan = await scanLibraryTarget(targetRoot);
    expect(targetScan).toBe(inventory.ownedSkills[0]!.integrity);
  });

  it("updates only a previously managed copy", async () => {
    const { library, targetRoot, inventory } = await fixture();
    const initial = planMaterialization(inventory, [{ descriptor: copyAgent, platform: process.platform as "darwin" | "linux" | "win32", detected: true, mode: "copy", root: targetRoot, existing: {} }]);
    await applyMaterializationPlan(initial);
    writeFileSync(join(library, "skills/writing/SKILL.md"), "# Updated\n");
    const rescanned = await scanLibrary(library);
    if (!rescanned.ok) throw new Error("rescan failed");
    const update = planMaterialization(rescanned.value, [{
      descriptor: copyAgent,
      platform: process.platform as "darwin" | "linux" | "win32",
      detected: true,
      mode: "copy",
      root: targetRoot,
      existing: { writing: { state: "managed-copy", integrity: inventory.ownedSkills[0]!.integrity, baseIntegrity: inventory.ownedSkills[0]!.integrity } },
    }]);
    expect(update.operations[0]?.action).toBe("update-copy");
    await applyMaterializationPlan(update);
    expect(readFileSync(join(targetRoot, "writing/SKILL.md"), "utf8")).toBe("# Updated\n");
  });

  it("recovers an interrupted managed create from its durable journal", async () => {
    const { library, targetRoot, inventory } = await fixture();
    const plan = planMaterialization(inventory, [{ descriptor: copyAgent, platform: process.platform as "darwin" | "linux" | "win32", detected: true, mode: "copy", root: targetRoot, existing: {} }]);
    const operation = plan.operations[0]!;
    const target = operation.target!;
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "SKILL.md"), "# Writing\n");
    writeFileSync(join(target, ".dotagent-managed.json"), JSON.stringify({ schemaVersion: 1, planId: plan.planId }));
    mkdirSync(join(library, ".dotagent"), { recursive: true });
    writeFileSync(join(library, ".dotagent/journal.json"), JSON.stringify({
      schemaVersion: 1,
      planId: plan.planId,
      phase: "applying",
      previousState: { schemaVersion: 1, targets: {} },
      operations: [{ operation, status: "applied" }],
    }));
    expect(await recoverMaterialization(library)).toBe(true);
    expect(existsSync(target)).toBe(false);
    expect(await recoverMaterialization(library)).toBe(false);
  });
});

async function scanLibraryTarget(targetRoot: string): Promise<string> {
  // Scan the managed copy directly by using it as a one-skill root.
  const { scanOwnedSkill } = await import("../src/inventory.js");
  const scanned = await scanOwnedSkill(targetRoot, "writing");
  if (!scanned.ok) throw new Error("target scan failed");
  return scanned.value.integrity;
}
