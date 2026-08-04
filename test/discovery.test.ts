import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverSkills, suggestImportCandidates } from "../src/discovery.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temp(): string {
  const root = mkdtempSync(join(tmpdir(), "dotagents-discovery-"));
  roots.push(root);
  return root;
}

function createSkill(root: string, folder: string, name = folder, body = "portable\n"): string {
  const skill = join(root, folder);
  mkdirSync(skill, { recursive: true });
  writeFileSync(
    join(skill, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} description\n---\n# ${name}\n${body}`,
  );
  return skill;
}

describe("cross-agent skill discovery", () => {
  it("deduplicates a shared skill and its real per-agent link while preserving locations", async () => {
    const root = temp();
    const shared = join(root, ".agents", "skills");
    const agent = join(root, ".codex", "skills");
    const actual = createSkill(shared, "writing");
    mkdirSync(agent, { recursive: true });
    symlinkSync(actual, join(agent, "writing"), "dir");

    const report = await discoverSkills([
      { path: shared, kind: "shared" },
      { path: agent, kind: "agent-local", agent: "codex" },
    ]);
    expect(report.issues).toEqual([]);
    expect(report.skills).toHaveLength(1);
    const skill = report.skills[0];
    if (!skill) throw new Error("fixture skill was not discovered");
    expect(skill).toMatchObject({ name: "writing", metadataValid: true });
    expect(skill.locations).toEqual([{ kind: "agent-local", agent: "codex" }, { kind: "shared" }]);
    expect(suggestImportCandidates(report)).toEqual([
      { kind: "owned", skill: "writing", sourcePath: skill.sourcePath, agents: ["codex"] },
    ]);
  });

  it("keeps same-name differences visible and leaves them local by default", async () => {
    const root = temp();
    const left = join(root, "left");
    const right = join(root, "right");
    createSkill(left, "review", "review", "left\n");
    createSkill(right, "review", "review", "right\n");
    const report = await discoverSkills([
      { path: left, kind: "shared" },
      { path: right, kind: "agent-local", agent: "codex" },
    ]);
    expect(report.collisions).toHaveLength(1);
    expect(new Set(report.collisions[0]?.candidateKeys).size).toBe(2);
    expect(suggestImportCandidates(report).every((candidate) => candidate.kind === "local-only")).toBe(true);
  });

  it("treats an internal SKILL.md symlink as an alias and reports unsafe content without following it", async () => {
    const root = temp();
    const shared = join(root, "skills");
    const canonical = createSkill(shared, "canonical");
    const alias = join(shared, "alias");
    mkdirSync(alias);
    symlinkSync(join(canonical, "SKILL.md"), join(alias, "SKILL.md"));
    const unsafe = createSkill(shared, "unsafe");
    symlinkSync(join(root, "outside.txt"), join(unsafe, "outside.txt"));
    writeFileSync(join(root, "outside.txt"), "outside\n");

    const report = await discoverSkills([{ path: shared, kind: "shared" }]);
    expect(report.linkedAliases).toBe(1);
    expect(report.skills.map((skill) => skill.name)).toEqual(["canonical"]);
    expect(report.issues.some((entry) => entry.code === "unsafe-link")).toBe(true);
  });

  it("uses verified provenance as a dependency suggestion", async () => {
    const root = temp();
    createSkill(root, "review");
    const report = await discoverSkills([{ path: root, kind: "agent-local", agent: "claude-code" }]);
    const skill = report.skills[0];
    if (!skill) throw new Error("fixture skill was not discovered");
    const candidates = suggestImportCandidates(report, [
      {
        skill: "review",
        package: "review-tools",
        url: "https://github.com/example/review-tools.git",
        ref: "main",
        skillPath: ".",
        source: "skills-cli",
        integrity: skill.integrity,
      },
    ]);
    expect(candidates).toEqual([
      {
        kind: "dependency",
        skill: "review",
        package: "review-tools",
        url: "https://github.com/example/review-tools.git",
        ref: "main",
        skillPath: ".",
        source: "skills-cli",
        agents: ["claude-code"],
      },
    ]);
  });
});
