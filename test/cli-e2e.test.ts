import { afterEach, describe, expect, it } from "bun:test";
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("CLI materialization flow", () => {
  it("documents deny-by-default trust for every networked Git command", async () => {
    const help = await run("bun", ["src/cli.ts", "--help"], { cwd: join(import.meta.dir, "..") });
    expect(help.stdout).toContain("clone <git-url> <library-directory> [source-trust-options]");
    expect(help.stdout).toContain("sync [library-directory] [--pull|--push]");
    expect(help.stdout).toContain("network is denied when omitted");
    expect(help.stdout).toContain("--allow-local-sources");
  });

  it("offers one guided setup command with a machine-readable preview", async () => {
    const root = mkdtempSync(join(tmpdir(), "dotagents-cli-setup-"));
    roots.push(root);
    const library = join(root, "library");
    const home = join(root, "home");
    mkdirSync(join(library, "skills", "writing"), { recursive: true });
    writeFileSync(
      join(library, "skills", "writing", "SKILL.md"),
      "---\nname: writing\ndescription: Writes clearly.\n---\n# Writing\n",
    );
    const preview = await run("bun", ["src/cli.ts", "setup", library, "--home", home, "--dry-run", "--json"], {
      cwd: join(import.meta.dir, ".."),
    });
    expect(JSON.parse(preview.stdout)).toMatchObject({ kind: "setup", summary: { skillsFound: 1, owned: 1 } });

    const applied = await run("bun", ["src/cli.ts", "setup", library, "--home", home, "--yes", "--json"], {
      cwd: join(import.meta.dir, ".."),
    });
    expect(JSON.parse(applied.stdout)).toMatchObject({ ok: true, result: { import: { copied: 0, adopted: 1 } } });
  });

  it("previews, requires confirmation, applies, and reports status", async () => {
    const root = mkdtempSync(join(tmpdir(), "dotagents-cli-e2e-"));
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

  it("previews recovery and rejects an unreviewed confirmation", async () => {
    const library = mkdtempSync(join(tmpdir(), "dotagents-cli-recovery-"));
    roots.push(library);
    const preview = await run("bun", ["src/cli.ts", "recover", library, "--json"], {
      cwd: join(import.meta.dir, ".."),
    });
    const plan = JSON.parse(preview.stdout) as { planId: string; import: null; materialization: null };
    expect(plan).toMatchObject({ import: null, materialization: null });
    expect(plan.planId).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      run("bun", ["src/cli.ts", "recover", library, "--yes"], { cwd: join(import.meta.dir, "..") }),
    ).rejects.toMatchObject({ stderr: expect.stringContaining("--plan-id is missing") });
    const applied = await run("bun", ["src/cli.ts", "recover", library, "--plan-id", plan.planId, "--yes", "--json"], {
      cwd: join(import.meta.dir, ".."),
    });
    expect(JSON.parse(applied.stdout)).toEqual({ recovered: false, import: "none", materialization: false });
  });

  it("serializes the normalized reviewed source policy into a dependency plan", async () => {
    const root = mkdtempSync(join(tmpdir(), "dotagents-cli-policy-"));
    roots.push(root);
    const upstream = join(root, "upstream");
    const library = join(root, "library");
    mkdirSync(join(upstream, "skills", "review"), { recursive: true });
    mkdirSync(library, { recursive: true });
    writeFileSync(
      join(upstream, "skills", "review", "SKILL.md"),
      "---\nname: review\ndescription: Reviews work.\n---\n# Review\n",
    );
    execFileSync("git", ["init", "--initial-branch", "main"], { cwd: upstream });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: upstream });
    execFileSync("git", ["config", "user.name", "test"], { cwd: upstream });
    execFileSync("git", ["add", "."], { cwd: upstream });
    execFileSync("git", ["commit", "-m", "review skill"], { cwd: upstream });
    const source = pathToFileURL(upstream).href;
    writeFileSync(
      join(library, "skills.json"),
      JSON.stringify({
        schema_version: 1,
        name: "policy-fixture",
        version: "1.0.0",
        skills: [],
        dependencies: { review: { url: source, ref: "HEAD", select: ["skills/review"] } },
      }),
    );

    const preview = await run(
      "bun",
      [
        "src/cli.ts",
        "resolve",
        library,
        "--trust-source",
        source,
        "--allow-local-sources",
        "--minimum-release-age",
        "0",
        "--json",
      ],
      { cwd: join(import.meta.dir, "..") },
    );
    expect(JSON.parse(preview.stdout).sourcePolicy).toEqual({
      trust: { mode: "allowlist", repositories: [source], hosts: [], github_organizations: [], allow_local: true },
      minimum_release_age_minutes: 0,
      minimum_release_age_exclude: [],
    });
  }, 20_000);
});
