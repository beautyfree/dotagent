import { afterEach, describe, expect, it } from "bun:test";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const repository = join(import.meta.dir, "..");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Git workspace CLI", () => {
  it("keeps commit and push previews separate from confirmed mutations", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dotagents-cli-git-"));
    roots.push(parent);
    const library = join(parent, "library");
    const remote = join(parent, "library.git");
    const commitPlan = join(parent, "commit.json");
    const pushPlan = join(parent, "push.json");
    const clonePlan = join(parent, "clone.json");
    const initPlan = join(parent, "init.json");
    const gitInitPlan = join(parent, "git-init.json");
    const remoteUrl = pathToFileURL(remote).href;
    execFileSync("git", ["init", "--bare", "--initial-branch", "main", remote]);

    await run("bun", ["src/cli.ts", "init", library, "--name", "portable", "--out", initPlan], {
      cwd: repository,
    });
    expect(existsSync(library)).toBe(false);
    await run("bun", ["src/cli.ts", "apply", initPlan, "--yes"], { cwd: repository });
    mkdirSync(join(library, "skills", "writing"), { recursive: true });
    writeFileSync(
      join(library, "skills", "writing", "SKILL.md"),
      "---\nname: writing\ndescription: Writes clearly.\n---\n# Writing\n",
    );
    const manifest = JSON.parse(readFileSync(join(library, "skills.json"), "utf8"));
    manifest.skills = ["skills/writing"];
    writeFileSync(join(library, "skills.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await run("bun", ["src/cli.ts", "git-init", library, "--remote", remoteUrl, "--out", gitInitPlan], {
      cwd: repository,
    });
    expect(existsSync(join(library, ".git"))).toBe(false);
    await run("bun", ["src/cli.ts", "apply", gitInitPlan, "--yes"], { cwd: repository });

    await run("bun", ["src/cli.ts", "commit", library, "--message", "Create library", "--out", commitPlan], {
      cwd: repository,
    });
    expect(existsSync(join(library, ".git", "refs", "heads", "main"))).toBe(false);
    await expect(run("bun", ["src/cli.ts", "apply", commitPlan], { cwd: repository })).rejects.toThrow();
    await run("bun", ["src/cli.ts", "apply", commitPlan, "--yes"], { cwd: repository });

    await run(
      "bun",
      [
        "src/cli.ts",
        "sync",
        library,
        "--push",
        "--trust-source",
        remoteUrl,
        "--allow-local-sources",
        "--out",
        pushPlan,
      ],
      { cwd: repository },
    );
    expect(existsSync(join(remote, "refs", "heads", "main"))).toBe(false);
    await run("bun", ["src/cli.ts", "apply", pushPlan, "--yes"], { cwd: repository });
    expect(execFileSync("git", ["--git-dir", remote, "show-ref"], { encoding: "utf8" })).toContain("refs/heads/main");

    const clone = join(parent, "clone");
    await run(
      "bun",
      [
        "src/cli.ts",
        "clone",
        remoteUrl,
        clone,
        "--trust-source",
        remoteUrl,
        "--allow-local-sources",
        "--out",
        clonePlan,
      ],
      {
        cwd: repository,
      },
    );
    expect(existsSync(clone)).toBe(false);
    const result = await run("bun", ["src/cli.ts", "apply", clonePlan, "--yes", "--json"], { cwd: repository });
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, root: clone, branch: "main", changed: false });
    expect(readFileSync(join(clone, "skills", "writing", "SKILL.md"), "utf8")).toContain("Writes clearly");
  });
});
