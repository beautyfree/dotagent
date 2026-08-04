import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSkillerSyncManifest,
  mergeSkillerSyncPublishUpdate,
  parseSkillerSyncManifest,
  planSkillerSyncPublish,
  stringifySkillerSyncManifest,
  validateSkillerSyncManifest,
} from "../src/adapters/skiller.js";

describe("Skiller compatibility adapter", () => {
  it("round-trips a current manifest", () => {
    const manifest = createSkillerSyncManifest("personal-backup", "public", {
      mode: "selected",
      agent_slugs: ["claude-code", "codex"],
    });
    expect(parseSkillerSyncManifest(stringifySkillerSyncManifest(manifest))).toEqual(manifest);
  });

  it("upgrades v1 and v2 manifests in memory without changing their source", () => {
    for (const version of [1, 2]) {
      const manifest = parseSkillerSyncManifest(
        `schema_version: ${version}\nprofile: { id: personal, mode: private }\nagent_policy: { mode: detected }\nskills:\n  - { id: writing, kind: bundled, path: skills/writing, sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa }\n`,
      );
      expect(manifest.schema_version).toBe(3);
      expect(manifest.skills[0]?.id).toBe("writing");
    }
  });

  it("accepts pinned skills.sh dependencies", () => {
    const manifest = parseSkillerSyncManifest(
      `schema_version: 3\nprofile: { id: personal, mode: private }\nagent_policy: { mode: detected }\nskills:\n  - { id: frontend-design, kind: skills_sh, source_url: https://github.com/vercel-labs/agent-skills, ref: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, skill_path: skills/frontend-design, installations: [codex] }\n`,
    );
    expect(manifest.skills[0]).toMatchObject({ kind: "skills_sh", installations: ["codex"] });
  });

  it("rejects duplicate ids, traversal, mismatched bundle paths, and embedded credentials", () => {
    const base = `profile: { id: personal, mode: private }\nagent_policy: { mode: detected }\n`;
    expect(() =>
      parseSkillerSyncManifest(
        `schema_version: 3\n${base}skills:\n  - { id: same, kind: bundled, path: skills/same, sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa }\n  - { id: same, kind: bundled, path: skills/same, sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb }\n`,
      ),
    ).toThrow("Duplicate");
    expect(() =>
      parseSkillerSyncManifest(
        `schema_version: 3\n${base}skills:\n  - { id: bad, kind: reference, repository: https://example.com/repo, ref: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, skill_path: skills/../bad }\n`,
      ),
    ).toThrow("traversal");
    expect(() =>
      parseSkillerSyncManifest(
        `schema_version: 3\n${base}skills:\n  - { id: bad, kind: bundled, path: skills/wrong, sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa }\n`,
      ),
    ).toThrow("must use path");
    expect(() =>
      parseSkillerSyncManifest(
        `schema_version: 3\n${base}skills:\n  - { id: bad, kind: reference, repository: https://user:password@example.com/repo, ref: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, skill_path: . }\n`,
      ),
    ).toThrow("credentials");
  });

  it("plans owned and pinned skills without writing a compatibility library", () => {
    const root = mkdtempSync(join(tmpdir(), "dotagents-skiller-publish-"));
    try {
      const source = join(root, "writing");
      mkdirSync(source);
      writeFileSync(join(source, "SKILL.md"), "# Writing\n");
      const plan = planSkillerSyncPublish("personal", "public", [
        { id: "writing", sourcePath: source, installationAgentSlugs: ["codex", "codex", "claude-code"] },
        {
          kind: "skills_sh",
          id: "frontend-design",
          sourceUrl: "https://github.com/vercel-labs/agent-skills",
          ref: "a".repeat(40),
          skillPath: "skills/frontend-design",
        },
      ]);
      const bundled = plan.bundledSkills[0];
      expect(bundled).toBeDefined();
      if (!bundled) throw new Error("Expected one bundled skill plan");
      expect(plan.planId).toMatch(/^[a-f0-9]{64}$/);
      expect(
        planSkillerSyncPublish("personal", "public", [
          { id: "writing", sourcePath: source, installationAgentSlugs: ["codex", "codex", "claude-code"] },
          {
            kind: "skills_sh",
            id: "frontend-design",
            sourceUrl: "https://github.com/vercel-labs/agent-skills",
            ref: "a".repeat(40),
            skillPath: "skills/frontend-design",
          },
        ]).planId,
      ).toBe(plan.planId);

      expect(plan.manifest.skills).toEqual([
        {
          id: "writing",
          kind: "bundled",
          path: "skills/writing",
          sha256: bundled.sha256,
          installations: ["claude-code", "codex"],
        },
        {
          id: "frontend-design",
          kind: "skills_sh",
          source_url: "https://github.com/vercel-labs/agent-skills",
          ref: "a".repeat(40),
          skill_path: "skills/frontend-design",
        },
      ]);
      expect(plan.bundledDistributions).toEqual({ writing: "owned" });
      expect(plan.secretFindings).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("merges only reviewed owned skills and preserves untouched remote entries", () => {
    const root = mkdtempSync(join(tmpdir(), "dotagents-skiller-merge-"));
    try {
      const source = join(root, "writing");
      mkdirSync(source);
      writeFileSync(join(source, "SKILL.md"), "# Writing\n");
      const update = planSkillerSyncPublish("personal", "private", [{ id: "writing", sourcePath: source }]);
      const dependency = {
        id: "frontend-design",
        kind: "reference" as const,
        repository: "https://github.com/vercel-labs/agent-skills",
        ref: "b".repeat(40),
        skill_path: "skills/frontend-design",
      };
      const base = validateSkillerSyncManifest({
        ...update.manifest,
        skills: [update.manifest.skills[0], dependency],
      });

      const merged = mergeSkillerSyncPublishUpdate(base, update);
      expect(merged.planId).not.toBe(update.planId);
      expect(merged.manifest.skills.map((skill) => skill.id)).toEqual(["writing", "frontend-design"]);
      expect(() =>
        mergeSkillerSyncPublishUpdate(validateSkillerSyncManifest({ ...base, skills: [dependency] }), update),
      ).toThrow("not a known bundled skill");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
