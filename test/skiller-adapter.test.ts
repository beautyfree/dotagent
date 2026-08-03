import { describe, expect, it } from "bun:test";
import {
  createSkillerSyncManifest,
  parseSkillerSyncManifest,
  stringifySkillerSyncManifest,
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
      const manifest = parseSkillerSyncManifest(`schema_version: ${version}\nprofile: { id: personal, mode: private }\nagent_policy: { mode: detected }\nskills:\n  - { id: writing, kind: bundled, path: skills/writing, sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa }\n`);
      expect(manifest.schema_version).toBe(3);
      expect(manifest.skills[0]?.id).toBe("writing");
    }
  });

  it("accepts pinned skills.sh dependencies", () => {
    const manifest = parseSkillerSyncManifest(`schema_version: 3\nprofile: { id: personal, mode: private }\nagent_policy: { mode: detected }\nskills:\n  - { id: frontend-design, kind: skills_sh, source_url: https://github.com/vercel-labs/agent-skills, ref: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, skill_path: skills/frontend-design, installations: [codex] }\n`);
    expect(manifest.skills[0]).toMatchObject({ kind: "skills_sh", installations: ["codex"] });
  });

  it("rejects duplicate ids, traversal, mismatched bundle paths, and embedded credentials", () => {
    const base = `profile: { id: personal, mode: private }\nagent_policy: { mode: detected }\n`;
    expect(() => parseSkillerSyncManifest(`schema_version: 3\n${base}skills:\n  - { id: same, kind: bundled, path: skills/same, sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa }\n  - { id: same, kind: bundled, path: skills/same, sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb }\n`)).toThrow("Duplicate");
    expect(() => parseSkillerSyncManifest(`schema_version: 3\n${base}skills:\n  - { id: bad, kind: reference, repository: https://example.com/repo, ref: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, skill_path: skills/../bad }\n`)).toThrow("traversal");
    expect(() => parseSkillerSyncManifest(`schema_version: 3\n${base}skills:\n  - { id: bad, kind: bundled, path: skills/wrong, sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa }\n`)).toThrow("must use path");
    expect(() => parseSkillerSyncManifest(`schema_version: 3\n${base}skills:\n  - { id: bad, kind: reference, repository: https://user:password@example.com/repo, ref: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, skill_path: . }\n`)).toThrow("credentials");
  });
});
