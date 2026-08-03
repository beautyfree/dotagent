import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scanOwnedSkill } from "../src/inventory.js";
import { parseLibraryManifest } from "../src/library.js";

const fixtures = join(import.meta.dir, "..", "fixtures", "conformance");

describe("third-party package conformance fixtures", () => {
  it("accepts a repository-root skill when a dependency explicitly selects dot", async () => {
    const root = join(fixtures, "root-skill");
    const manifest = parseLibraryManifest(
      JSON.stringify({
        schema_version: 1,
        name: "consumer",
        version: "1.0.0",
        skills: [],
        dependencies: {
          root: { url: "https://github.com/example/root-skill", ref: "v1.0.0", select: ["."] },
        },
      }),
    );
    expect(manifest.ok).toBe(true);

    const rootScan = await scanOwnedSkill(root, ".");
    expect(rootScan.ok).toBe(true);
    if (rootScan.ok) expect(rootScan.value.name).toBe("root-review");
  });

  it("loads and scans a flat multi-skill package without executing its content", async () => {
    const root = join(fixtures, "multi-skill");
    const manifest = parseLibraryManifest(readFileSync(join(root, "skills.json"), "utf8"));
    expect(manifest.ok).toBe(true);
    if (!manifest.ok) return;

    const names: string[] = [];
    for (const skillPath of manifest.value.skills) {
      const segments = skillPath.split("/");
      const skillDirectory = segments.at(-1);
      if (!skillDirectory) throw new Error(`Fixture has an empty skill path: ${skillPath}`);
      const scan = await scanOwnedSkill(join(root, ...segments.slice(0, -1)), skillDirectory);
      expect(scan.ok).toBe(true);
      if (scan.ok) names.push(scan.value.name);
    }
    expect(names).toEqual(["plan", "review"]);
  });
});
