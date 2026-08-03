import { afterEach, describe, expect, it } from "bun:test";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { parse } from "yaml";
import { applyImportPlan, recoverImport } from "../src/import-apply.js";
import { planImport } from "../src/import.js";
import { applyInitializeLibraryPlan, planInitializeLibrary } from "../src/init.js";
import { scanLibrary } from "../src/inventory.js";

const roots: string[] = [];
const run = promisify(execFile);
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

async function library(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "dotagent-import-library-"));
  roots.push(root);
  await applyInitializeLibraryPlan(planInitializeLibrary(root, "portable-library"));
  return root;
}

function skill(name: string, extra = ""): string {
  const parent = mkdtempSync(join(tmpdir(), "dotagent-import-source-"));
  roots.push(parent);
  const root = join(parent, name);
  mkdirSync(root);
  writeFileSync(join(root, "SKILL.md"), `---\nname: ${name}\ndescription: Helps with ${name}.\n---\n# ${name}\n${extra}`);
  writeFileSync(join(root, "guide.md"), "portable content\n");
  return root;
}

describe("canonical import planning and apply", () => {
  it("previews and applies owned, dependency, and local-only dispositions", async () => {
    const root = await library();
    const owned = skill("writing");
    const plan = await planImport(root, [
      { kind: "owned", skill: "writing", sourcePath: owned, agents: ["codex", "claude-code", "codex"] },
      { kind: "dependency", skill: "review", package: "review-tools", url: "https://github.com/example/review-tools.git", ref: "main", skillPath: ".", source: "skills-cli", agents: ["codex"] },
      { kind: "local-only", skill: "private-notes", sourcePath: join(root, "elsewhere"), reason: "Contains machine-specific notes" },
    ]);

    expect(plan.hasConflicts).toBe(false);
    expect(plan.requiresResolve).toBe(true);
    expect(plan.operations.map((operation) => operation.action)).toEqual(["leave-local", "record-dependency", "copy-owned"]);
    expect(plan.nextManifest).toMatchObject({
      skills: ["skills/writing"],
      dependencies: { "review-tools": { ref: "main", select: ["."] } },
    });
    expect(plan.nextConfig.skills.writing?.agents).toEqual(["claude-code", "codex"]);
    expect(existsSync(join(root, "skills", "writing"))).toBe(false);

    const result = await applyImportPlan(plan);
    expect(result).toMatchObject({ copied: 1, dependenciesRecorded: 1, requiresResolve: true });
    expect(readFileSync(join(root, "skills", "writing", "guide.md"), "utf8")).toBe("portable content\n");
    expect(readFileSync(join(owned, "guide.md"), "utf8")).toBe("portable content\n");
    expect(parse(readFileSync(join(root, "dotagent.yaml"), "utf8"))).toMatchObject({
      skills: { writing: { include: true, agents: ["claude-code", "codex"] }, review: { distribution: "dependency" } },
    });
    const inventory = await scanLibrary(root);
    expect(inventory.ok && inventory.value.ownedSkills.map((entry) => entry.name)).toEqual(["writing"]);
  });

  it("blocks possible secrets without creating portable files", async () => {
    const root = await library();
    const source = skill("unsafe", "\ngithub_pat_abcdefghijklmnopqrstuvwxyz123456\n");
    const plan = await planImport(root, [{ kind: "owned", skill: "unsafe", sourcePath: source }]);
    expect(plan.secretFindings).toEqual([{ skill: "unsafe", relativePath: "SKILL.md", rule: "github-token", line: 7, column: 1 }]);
    await expect(applyImportPlan(plan)).rejects.toThrow("possible secret");
    expect(existsSync(join(root, "skills", "unsafe"))).toBe(false);
  });

  it("never adopts an unmanaged target implicitly", async () => {
    const root = await library();
    const source = skill("writing");
    mkdirSync(join(root, "skills", "writing"));
    writeFileSync(join(root, "skills", "writing", "SKILL.md"), "unmanaged\n");
    const plan = await planImport(root, [{ kind: "owned", skill: "writing", sourcePath: source }]);
    expect(plan.hasConflicts).toBe(true);
    expect(plan.operations[0]).toMatchObject({ action: "conflict", reason: "The target folder already exists but is not managed by the manifest" });
    await expect(applyImportPlan(plan)).rejects.toThrow("contains conflicts");
  });

  it("rejects a stale source and rolls back earlier writes after a later failure", async () => {
    const root = await library();
    const first = skill("first");
    const second = skill("second");
    const stale = await planImport(root, [{ kind: "owned", skill: "first", sourcePath: first }]);
    writeFileSync(join(first, "guide.md"), "changed after preview\n");
    await expect(applyImportPlan(stale)).rejects.toThrow("changed after review");
    expect(existsSync(join(root, "skills", "first"))).toBe(false);

    const plan = await planImport(root, [
      { kind: "owned", skill: "first", sourcePath: first },
      { kind: "owned", skill: "second", sourcePath: second },
    ]);
    await expect(applyImportPlan(plan, {
      beforeOperation: (_operation, index) => { if (index === 1) throw new Error("simulated failure"); },
    })).rejects.toThrow("simulated failure");
    expect(existsSync(join(root, "skills", "first"))).toBe(false);
    expect(existsSync(join(root, "skills", "second"))).toBe(false);
    expect(JSON.parse(readFileSync(join(root, "skills.json"), "utf8")).skills).toEqual([]);
  });

  it("recovers a real process interruption from its durable journal", async () => {
    const root = await library();
    const first = skill("first");
    const second = skill("second");
    const plan = await planImport(root, [
      { kind: "owned", skill: "first", sourcePath: first },
      { kind: "owned", skill: "second", sourcePath: second },
    ]);
    const runner = join(root, "crash-import.ts");
    const moduleUrl = pathToFileURL(join(process.cwd(), "src", "import-apply.ts")).href;
    writeFileSync(runner, `import { applyImportPlan } from ${JSON.stringify(moduleUrl)};\nconst plan = ${JSON.stringify(plan)};\nawait applyImportPlan(plan, { beforeOperation: (_operation, index) => { if (index === 1) process.exit(86); } });\n`);
    await expect(run(process.execPath, [runner], { cwd: process.cwd() })).rejects.toThrow();
    expect(existsSync(join(root, "skills", "first"))).toBe(true);
    expect(existsSync(join(root, ".dotagent", "import-journal.json"))).toBe(true);
    expect(await recoverImport(root)).toBe("rolled-back");
    expect(existsSync(join(root, "skills", "first"))).toBe(false);
    expect(existsSync(join(root, ".dotagent", "import-journal.json"))).toBe(false);
  });
});
