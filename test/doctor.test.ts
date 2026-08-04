import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { doctorLibrary } from "../src/doctor.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function library(): string {
  const root = mkdtempSync(join(tmpdir(), "dotagents-doctor-"));
  roots.push(root);
  mkdirSync(join(root, "skills/writing"), { recursive: true });
  writeFileSync(join(root, "skills/writing/SKILL.md"), "# Writing\n");
  writeFileSync(
    join(root, "skills.json"),
    JSON.stringify({
      schema_version: 1,
      name: "personal",
      version: "1.0.0",
      skills: ["skills/writing"],
      dependencies: {},
    }),
  );
  writeFileSync(join(root, "dotagents.yaml"), "schema_version: 1\ndefaults: { include: all }\nskills: {}\n");
  writeFileSync(join(root, ".gitignore"), "dotagents.local.yaml\n.dotagents/\n");
  return root;
}

describe("doctor", () => {
  it("reports a healthy portable library without writes", async () => {
    const report = await doctorLibrary({ root: library() });
    expect(report).toMatchObject({ ok: true, issues: [], library: { name: "personal" } });
  });

  it("blocks publishing when machine-local state is not ignored", async () => {
    const root = library();
    writeFileSync(join(root, ".gitignore"), "");
    const report = await doctorLibrary({ root });
    expect(report.ok).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({ code: "local-state-not-ignored", severity: "error" }),
    );
  });

  it("distinguishes a missing lock warning from a stale lock error", async () => {
    const root = library();
    writeFileSync(
      join(root, "skills.json"),
      JSON.stringify({
        schema_version: 1,
        name: "personal",
        version: "1.0.0",
        skills: ["skills/writing"],
        dependencies: {
          source: { url: "https://github.com/example/source", ref: "main" },
        },
      }),
    );
    const missing = await doctorLibrary({ root });
    expect(missing.ok).toBe(true);
    expect(missing.issues).toContainEqual(expect.objectContaining({ code: "lockfile-missing", severity: "warning" }));
    writeFileSync(
      join(root, "skills.lock"),
      JSON.stringify({ lockfile_version: 1, generated_by: "test", resolved: {} }),
    );
    const stale = await doctorLibrary({ root });
    expect(stale.ok).toBe(false);
    expect(stale.issues).toContainEqual(expect.objectContaining({ code: "lockfile-stale", severity: "error" }));
  });

  it("treats changed dependency selection as a stale lock", async () => {
    const root = library();
    writeFileSync(
      join(root, "skills.json"),
      JSON.stringify({
        schema_version: 1,
        name: "personal",
        version: "1.0.0",
        skills: ["skills/writing"],
        dependencies: {
          source: { url: "https://github.com/example/source", ref: "main", select: ["skills/new"] },
        },
      }),
    );
    writeFileSync(
      join(root, "skills.lock"),
      JSON.stringify({
        lockfile_version: 1,
        generated_by: "test",
        resolved: {
          source: {
            url: "https://github.com/example/source",
            requested_ref: "main",
            commit: "a".repeat(40),
            integrity: "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            skills: [{ name: "old", path: "skills/old" }],
          },
        },
      }),
    );
    const report = await doctorLibrary({ root });
    expect(report.ok).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({ code: "lockfile-stale", message: expect.stringContaining("selected skill paths") }),
    );
  });
});
