import { afterEach, describe, expect, it } from "bun:test";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("import CLI", () => {
  it("keeps preview and confirmed apply as separate steps", async () => {
    const root = mkdtempSync(join(tmpdir(), "dotagent-cli-import-"));
    roots.push(root);
    const library = join(root, "library");
    const source = join(root, "source");
    const planFile = join(root, "import-plan.json");
    mkdirSync(source);
    writeFileSync(join(source, "SKILL.md"), "---\nname: writing\ndescription: Writes clearly.\n---\n# Writing\n");
    await run("bun", ["src/cli.ts", "init", library, "--name", "portable-library"], { cwd: process.cwd() });
    await run("bun", ["src/cli.ts", "import", library, "--owned", `writing=${source}`, "--out", planFile], {
      cwd: process.cwd(),
    });
    expect(existsSync(join(library, "skills", "writing"))).toBe(false);
    await expect(run("bun", ["src/cli.ts", "apply", planFile], { cwd: process.cwd() })).rejects.toThrow();
    const applied = await run("bun", ["src/cli.ts", "apply", planFile, "--yes", "--json"], { cwd: process.cwd() });
    expect(JSON.parse(applied.stdout)).toMatchObject({ copied: 1, dependenciesRecorded: 0 });
    expect(readFileSync(join(library, "skills", "writing", "SKILL.md"), "utf8")).toContain("Writes clearly");
  });
});
