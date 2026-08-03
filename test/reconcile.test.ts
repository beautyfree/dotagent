import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { planSkillExport } from "../src/export-policy.js";
import {
  applyLibraryReconciliationPlan,
  hasLibraryReconciliationRecovery,
  planLibraryReconciliation,
  recoverLibraryReconciliation,
  type LibraryReconciliationPlan,
} from "../src/reconcile.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(skills: Record<string, string> = { writing: "# Remote\n" }): {
  root: string;
  sourceRoot: string;
  targetRoot: string;
  sources: { id: string; path: string; integrity: string }[];
} {
  const root = mkdtempSync(path.join(tmpdir(), "dotagent-reconcile-"));
  roots.push(root);
  const sourceRoot = path.join(root, "remote");
  const targetRoot = path.join(root, "local", "skills");
  const sources = Object.entries(skills).map(([id, body]) => {
    const relativePath = `skills/${id}`;
    const skillRoot = path.join(sourceRoot, relativePath);
    mkdirSync(skillRoot, { recursive: true });
    writeFileSync(path.join(skillRoot, "SKILL.md"), body);
    return { id, path: relativePath, integrity: planSkillExport(id, skillRoot).sha256 };
  });
  return { root, sourceRoot, targetRoot, sources };
}

function plan(
  current: ReturnType<typeof fixture>,
  base?: Record<string, { baseIntegrity: string | null; keptRemoteIntegrity?: string | null }>,
): LibraryReconciliationPlan {
  return planLibraryReconciliation({
    sourceRoot: current.sourceRoot,
    targetRoot: current.targetRoot,
    skills: current.sources,
    ...(base ? { base } : {}),
  });
}

describe("library reconciliation", () => {
  it("creates one serializable plan and applies only an explicit remote decision", () => {
    const current = fixture();
    const review = plan(current);
    expect(review.operations).toMatchObject([{ skill: "writing", action: "take-remote" }]);
    expect(existsSync(path.join(current.targetRoot, "writing"))).toBe(false);

    expect(applyLibraryReconciliationPlan(review, []).restored).toEqual([]);
    expect(existsSync(path.join(current.targetRoot, "writing"))).toBe(false);
    expect(applyLibraryReconciliationPlan(review, [{ skill: "writing", action: "take-remote" }]).restored).toEqual([
      "writing",
    ]);
    expect(readFileSync(path.join(current.targetRoot, "writing", "SKILL.md"), "utf8")).toBe("# Remote\n");
  });

  it("classifies local, remote, concurrent, kept-local, and unmanaged state", () => {
    const current = fixture();
    const target = path.join(current.targetRoot, "writing");
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, "SKILL.md"), "# Base\n");
    const base = planSkillExport("writing", target).sha256;
    const source = current.sources[0];
    if (!source) throw new Error("fixture produced no source");
    const remote = source.integrity;

    expect(plan(current, { writing: { baseIntegrity: base } }).operations[0]?.action).toBe("take-remote");
    writeFileSync(path.join(target, "SKILL.md"), "# Local\n");
    expect(plan(current, { writing: { baseIntegrity: remote } }).operations[0]?.action).toBe("publish-local");
    expect(plan(current, { writing: { baseIntegrity: base } }).operations[0]?.action).toBe("conflict");
    expect(plan(current, { writing: { baseIntegrity: base, keptRemoteIntegrity: remote } }).operations[0]?.action).toBe(
      "kept-local",
    );
    expect(plan(current).operations[0]?.action).toBe("unmanaged");
  });

  it("requires an explicit choice for an unmanaged target and protects preview preconditions", () => {
    const current = fixture();
    const target = path.join(current.targetRoot, "writing");
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, "SKILL.md"), "# Local\n");
    const review = plan(current);
    expect(review.operations[0]?.action).toBe("unmanaged");
    writeFileSync(path.join(target, "SKILL.md"), "# Changed after review\n");
    expect(() => applyLibraryReconciliationPlan(review, [{ skill: "writing", action: "take-remote" }])).toThrow(
      "changed after review",
    );
    expect(readFileSync(path.join(target, "SKILL.md"), "utf8")).toBe("# Changed after review\n");
  });

  it("allows an explicit remote choice to replace publish-local and kept-local states", () => {
    const current = fixture({ publish: "# Remote publish\n", kept: "# Remote kept\n" });
    const base: Record<string, { baseIntegrity: string; keptRemoteIntegrity?: string }> = {};
    for (const source of current.sources) {
      const target = path.join(current.targetRoot, source.id);
      mkdirSync(target, { recursive: true });
      writeFileSync(path.join(target, "SKILL.md"), `# Local ${source.id}\n`);
      base[source.id] = {
        baseIntegrity: source.integrity,
        ...(source.id === "kept" ? { keptRemoteIntegrity: source.integrity } : {}),
      };
    }
    const review = plan(current, base);
    expect(review.operations).toMatchObject([
      { skill: "kept", action: "kept-local" },
      { skill: "publish", action: "publish-local" },
    ]);
    expect(
      applyLibraryReconciliationPlan(
        review,
        review.operations.map((operation) => ({ skill: operation.skill, action: "take-remote" as const })),
      ).restored,
    ).toEqual(["kept", "publish"]);
    expect(readFileSync(path.join(current.targetRoot, "kept", "SKILL.md"), "utf8")).toBe("# Remote kept\n");
    expect(readFileSync(path.join(current.targetRoot, "publish", "SKILL.md"), "utf8")).toBe("# Remote publish\n");
  });

  it("rejects a changed remote and value-free secret findings before target writes", () => {
    const current = fixture();
    const review = plan(current);
    writeFileSync(path.join(current.sourceRoot, "skills", "writing", "SKILL.md"), "# Changed\n");
    expect(() => applyLibraryReconciliationPlan(review, [{ skill: "writing", action: "take-remote" }])).toThrow(
      "Remote skill changed after review",
    );
    expect(existsSync(path.join(current.targetRoot, "writing"))).toBe(false);

    const secret = fixture({ private: "TOKEN=ghp_abcdefghijklmnopqrstuvwxyz123456\n" });
    const secretPlan = plan(secret);
    expect(secretPlan.secretFindings).toEqual([
      { skill: "private", relativePath: "SKILL.md", rule: "github-token", line: 1, column: 7 },
    ]);
    expect(JSON.stringify(secretPlan)).not.toContain("ghp_");
    expect(() => applyLibraryReconciliationPlan(secretPlan, [{ skill: "private", action: "take-remote" }])).toThrow(
      "blocked",
    );
  });

  it("rolls back every earlier target when a later operation fails", () => {
    const current = fixture({ first: "# First\n", second: "# Second\n" });
    const review = plan(current);
    expect(() =>
      applyLibraryReconciliationPlan(
        review,
        review.operations.map((operation) => ({ skill: operation.skill, action: "take-remote" as const })),
        {
          beforeOperation: (_operation, index) => {
            if (index === 1) throw new Error("simulated failure");
          },
        },
      ),
    ).toThrow("simulated failure");
    expect(existsSync(path.join(current.targetRoot, "first"))).toBe(false);
    expect(existsSync(path.join(current.targetRoot, "second"))).toBe(false);
  });

  it("recovers an interrupted create from its durable journal", () => {
    const current = fixture();
    const review = plan(current);
    const operation = review.operations[0];
    if (!operation) throw new Error("fixture produced no operation");
    mkdirSync(operation.target, { recursive: true });
    writeFileSync(path.join(operation.target, "SKILL.md"), "# Remote\n");
    const journalPath = path.join(current.root, "state", "reconcile-journal.json");
    const stagePath = `${operation.target}.dotagent-stage-test`;
    const backupPath = `${operation.target}.dotagent-backup-test`;
    mkdirSync(path.dirname(journalPath), { recursive: true });
    writeFileSync(
      journalPath,
      JSON.stringify({
        kind: "library-reconcile",
        schemaVersion: 1,
        planId: review.planId,
        phase: "applying",
        entries: [{ operation, stagePath, backupPath, hadPrevious: false, status: "applied" }],
      }),
    );
    expect(hasLibraryReconciliationRecovery(journalPath)).toBe(true);
    expect(recoverLibraryReconciliation(journalPath)).toBe(true);
    expect(existsSync(operation.target)).toBe(false);
    expect(hasLibraryReconciliationRecovery(journalPath)).toBe(false);
  });
});
