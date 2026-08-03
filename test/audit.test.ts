import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLibrary } from "../src/audit.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function fixture(skillMd: string, license?: string): string {
  const root = mkdtempSync(join(tmpdir(), "dotagent-audit-"));
  roots.push(root);
  mkdirSync(join(root, "skills/writing"), { recursive: true });
  writeFileSync(join(root, "skills/writing/SKILL.md"), skillMd);
  writeFileSync(join(root, "skills.json"), JSON.stringify({ schema_version: 1, name: "personal", version: "1.0.0", skills: ["skills/writing"], dependencies: {}, ...(license ? { license } : {}) }));
  return root;
}

describe("library audit", () => {
  it("accepts a licensed public library with Agent Skills metadata", async () => {
    const report = await auditLibrary({ root: fixture("---\nname: writing\ndescription: Helps write clearly.\n---\n# Writing\n", "MIT"), visibility: "public" });
    expect(report).toMatchObject({ ok: true, publicReady: true, issues: [] });
  });

  it("blocks invalid skill metadata and a missing public license", async () => {
    const report = await auditLibrary({ root: fixture("# Writing\n"), visibility: "public" });
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(["missing-license", "missing-skill-metadata"]);
  });

  it("keeps a missing private license advisory instead of blocking local use", async () => {
    const report = await auditLibrary({ root: fixture("---\nname: writing\ndescription: Helps write clearly.\n---\n"), visibility: "private" });
    expect(report.ok).toBe(true);
    expect(report.publicReady).toBe(false);
    expect(report.issues[0]).toMatchObject({ code: "missing-license", severity: "warning" });
  });
});
