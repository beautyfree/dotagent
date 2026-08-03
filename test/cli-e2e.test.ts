import { afterEach, describe, expect, it } from "bun:test";
import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("CLI materialization flow", () => {
  it("previews, requires confirmation, applies, and reports status", async () => {
    const root = mkdtempSync(join(tmpdir(), "dotagent-cli-e2e-"));
    roots.push(root);
    const library = join(root, "library");
    const targets = join(root, "targets");
    const planFile = join(root, "plan.json");
    mkdirSync(join(library, "skills/writing"), { recursive: true });
    writeFileSync(join(library, "skills/writing/SKILL.md"), "# Writing\n");
    writeFileSync(
      join(library, "skills.json"),
      JSON.stringify({
        schema_version: 1,
        name: "personal",
        version: "1.0.0",
        skills: ["skills/writing"],
        dependencies: {},
      }),
    );

    await run("bun", ["src/cli.ts", "plan", library, "--target", `fixture=copy=${targets}`, "--out", planFile], {
      cwd: join(import.meta.dir, ".."),
    });
    expect(JSON.parse(readFileSync(planFile, "utf8")).operations[0].action).toBe("create-copy");

    await expect(
      run("bun", ["src/cli.ts", "apply", planFile], { cwd: join(import.meta.dir, "..") }),
    ).rejects.toMatchObject({ stderr: expect.stringContaining("explicit --yes") });
    await run("bun", ["src/cli.ts", "apply", planFile, "--yes", "--json"], { cwd: join(import.meta.dir, "..") });
    const status = await run("bun", ["src/cli.ts", "status", library, "--json"], { cwd: join(import.meta.dir, "..") });
    expect(JSON.parse(status.stdout).targets[0]).toMatchObject({
      agent: "fixture",
      skill: "writing",
      health: "current",
    });
  });
});
