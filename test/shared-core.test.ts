import { describe, expect, it } from "bun:test";
import { scanTextForSecrets } from "../src/audit.js";
import { mergeConfig, parseLocalConfig, parsePortableConfig } from "../src/config.js";
import { classifyThreeWaySkill } from "../src/reconcile.js";
import { parseSkillsCliLock } from "../src/adapters/skills-cli.js";

describe("portable and local configuration", () => {
  it("merges machine-local choices deterministically and exposes provenance", () => {
    const portable = parsePortableConfig("schema_version: 1\ndefaults: { include: owned }\nskills:\n  writing: { agents: [codex] }\n");
    const local = parseLocalConfig("schema_version: 1\nagents: { selected: [codex] }\nmaterialization: symlink\nexclusions: [private, scratch]\nenvironment: { github_token: '${GITHUB_TOKEN}' }\n");
    expect(mergeConfig(portable, local)).toEqual(expect.objectContaining({
      defaults: { include: "owned" },
      agents: { selected: ["codex"] },
      materialization: "symlink",
      exclusions: ["private", "scratch"],
      provenance: expect.objectContaining({ skills: "portable", agents: "local" }),
    }));
  });

  it("rejects literal environment secrets in local configuration", () => {
    expect(() => parseLocalConfig("schema_version: 1\nenvironment: { token: literal-secret }\n")).toThrow("environment.token");
  });
});

describe("shared safety primitives", () => {
  it("keeps secret values out of findings", () => {
    const text = "TOKEN=ghp_abcdefghijklmnopqrstuvwxyz123456";
    const findings = scanTextForSecrets(text);
    expect(findings).toEqual([{ rule: "github-token", line: 1, column: 7 }]);
    expect(JSON.stringify(findings)).not.toContain("ghp_");
  });

  it("never overwrites unknown local content by default", () => {
    expect(classifyThreeWaySkill("writing", null, "local", "remote").action).toBe("unmanaged");
  });
});

describe("Skills CLI adapter", () => {
  it("reads v3 and rejects unknown schemas", () => {
    const lock = parseSkillsCliLock(JSON.stringify({ version: 3, skills: {
      writing: { source: "owner/repo", sourceType: "github", sourceUrl: "https://github.com/owner/repo", ref: "main", skillPath: "skills/writing" },
    } }));
    expect(lock).toMatchObject({ version: 3, skills: [{ name: "writing", ref: "main" }] });
    expect(parseSkillsCliLock('{"version":999,"skills":{}}')).toBeNull();
  });
});
