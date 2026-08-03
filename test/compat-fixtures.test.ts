import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSkillerSyncManifest } from "../src/adapters/skiller.js";
import { parseSkillsCliLock, skillsCliLockToProvenance } from "../src/adapters/skills-cli.js";

const fixtures = join(import.meta.dir, "..", "fixtures", "compat");

describe("committed compatibility fixtures", () => {
  for (const version of [1, 2, 3] as const) {
    it(`loads Skiller manifest v${version} through the versioned adapter`, () => {
      const manifest = parseSkillerSyncManifest(readFileSync(join(fixtures, `skiller-v${version}.yaml`), "utf8"));
      expect(manifest.schema_version).toBe(3);
      expect(manifest.skills.length).toBeGreaterThan(0);
    });
  }

  it("loads Skills CLI v3 without rewriting its source model", () => {
    const lock = parseSkillsCliLock(readFileSync(join(fixtures, "skills-cli-v3.json"), "utf8"));
    if (!lock) throw new Error("Skills CLI v3 fixture did not parse");
    expect(skillsCliLockToProvenance(lock).provenance).toEqual([
      expect.objectContaining({ skill: "review", source: "skills-cli", skillPath: "skills/review" }),
    ]);
  });
});
