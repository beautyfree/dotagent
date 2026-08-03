import { afterEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  applyLibraryCommit,
  applyLibraryPull,
  applyLibraryPush,
  cloneLibrary,
  getLibraryGitStatus,
  initializeLibraryGit,
  planLibraryCommit,
  planLibraryPull,
  planLibraryPush,
} from "../src/git-workspace.js";
import { applyInitializeLibraryPlan, planInitializeLibrary } from "../src/init.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

async function initializedLibrary(parent: string, name: string): Promise<string> {
  const root = join(parent, name);
  await applyInitializeLibraryPlan(planInitializeLibrary(root, name));
  return root;
}

function addSkill(root: string, name: string, body = "portable\n"): void {
  mkdirSync(join(root, "skills", name), { recursive: true });
  writeFileSync(join(root, "skills", name, "SKILL.md"), `---\nname: ${name}\ndescription: ${name} description.\n---\n# ${name}\n${body}`);
  const manifest = JSON.parse(readFileSync(join(root, "skills.json"), "utf8"));
  manifest.skills = [...new Set([...(manifest.skills ?? []), `skills/${name}`])].sort();
  writeFileSync(join(root, "skills.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

describe("Git-backed library workspace", () => {
  it("commits only reviewed portable files and blocks unsafe or secret changes", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dotagent-git-commit-"));
    roots.push(parent);
    const library = await initializedLibrary(parent, "personal");
    addSkill(library, "writing");
    await initializeLibraryGit(library);
    const plan = await planLibraryCommit(library, "Create portable library");
    expect(plan.hasBlockers).toBe(false);
    expect(plan.files.map((file) => file.path)).toContain("skills/writing/SKILL.md");
    expect(await applyLibraryCommit(plan)).toMatch(/^[a-f0-9]{40}$/);
    expect((await getLibraryGitStatus(library)).changed).toBe(false);

    writeFileSync(join(library, ".env"), "TOKEN=secret\n");
    const unsafe = await planLibraryCommit(library, "Unsafe file");
    expect(unsafe.hasBlockers).toBe(true);
    expect(unsafe.unsafePaths).toEqual([".env"]);
    rmSync(join(library, ".env"));
    writeFileSync(join(library, "README.md"), "github_pat_abcdefghijklmnopqrstuvwxyz123456\n");
    const secret = await planLibraryCommit(library, "Secret file");
    expect(secret.hasBlockers).toBe(true);
    expect(secret.secretFindings).toEqual([{ file: "README.md", rule: "github-token", line: 1, column: 1 }]);
    await expect(applyLibraryCommit(secret)).rejects.toThrow("blockers");
  });

  it("pushes and fast-forwards through a generic remote only after separate previews", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dotagent-git-sync-"));
    roots.push(parent);
    const remote = join(parent, "remote.git");
    execFileSync("git", ["init", "--bare", "--initial-branch", "main", remote]);
    const first = await initializedLibrary(parent, "first-library");
    addSkill(first, "review", "first\n");
    await initializeLibraryGit(first, pathToFileURL(remote).href);
    await applyLibraryCommit(await planLibraryCommit(first, "Initial library"));
    const firstPush = await planLibraryPush(first);
    expect(firstPush.remoteIdentity).toBe(pathToFileURL(remote).href.replace(/\/$/, ""));
    await applyLibraryPush(firstPush);

    const second = join(parent, "second-library");
    await cloneLibrary(pathToFileURL(remote).href, second);
    writeFileSync(join(second, "skills/review/SKILL.md"), "---\nname: review\ndescription: review description.\n---\n# review\nsecond\n");
    await applyLibraryCommit(await planLibraryCommit(second, "Update review"));
    await applyLibraryPush(await planLibraryPush(second));

    const pull = await planLibraryPull(first);
    expect(pull).toMatchObject({ hasBlockers: false, files: ["skills/review/SKILL.md"] });
    expect(readFileSync(join(first, "skills/review/SKILL.md"), "utf8")).toContain("first");
    await applyLibraryPull(pull);
    expect(readFileSync(join(first, "skills/review/SKILL.md"), "utf8")).toContain("second");
  }, 20_000);

  it("blocks a malicious remote secret before fast-forwarding the working tree", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dotagent-git-secret-pull-"));
    roots.push(parent);
    const remote = join(parent, "remote.git");
    execFileSync("git", ["init", "--bare", "--initial-branch", "main", remote]);
    const first = await initializedLibrary(parent, "first-library");
    await initializeLibraryGit(first, pathToFileURL(remote).href);
    await applyLibraryCommit(await planLibraryCommit(first, "Initial library"));
    await applyLibraryPush(await planLibraryPush(first));
    const attacker = join(parent, "attacker");
    execFileSync("git", ["clone", pathToFileURL(remote).href, attacker]);
    execFileSync("git", ["config", "user.email", "attacker@example.invalid"], { cwd: attacker });
    execFileSync("git", ["config", "user.name", "attacker"], { cwd: attacker });
    writeFileSync(join(attacker, "README.md"), "ghp_abcdefghijklmnopqrstuvwxyz123456\n");
    execFileSync("git", ["add", "README.md"], { cwd: attacker });
    execFileSync("git", ["commit", "-m", "malicious"], { cwd: attacker });
    execFileSync("git", ["push", "origin", "main"], { cwd: attacker });

    const pull = await planLibraryPull(first);
    expect(pull.hasBlockers).toBe(true);
    expect(pull.secretFindings).toEqual([{ file: "README.md", rule: "github-token", line: 1, column: 1 }]);
    await expect(applyLibraryPull(pull)).rejects.toThrow("blockers");
    expect(readFileSync(join(first, "README.md"), "utf8")).not.toContain("ghp_");
    expect(existsSync(join(first, ".dotagent"))).toBe(true);
  }, 20_000);
});
