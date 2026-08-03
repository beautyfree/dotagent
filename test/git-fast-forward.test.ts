import { afterEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyGitFastForwardPlan, inspectGitFastForwardPlan, planGitFastForward } from "../src/git-fast-forward.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function commitFile(repository: string, content: string, message: string): void {
  writeFileSync(join(repository, "library.txt"), content);
  git(repository, "add", "library.txt");
  git(repository, "commit", "-m", message);
}

function readText(repository: string): string {
  return readFileSync(join(repository, "library.txt"), "utf8").replaceAll("\r\n", "\n");
}

describe("generic Git fast-forward review", () => {
  it("inspects an exact remote commit without changing the worktree and rejects a stale apply", async () => {
    const root = mkdtempSync(join(tmpdir(), "dotagent-fast-forward-"));
    roots.push(root);
    const remote = join(root, "remote.git");
    const publisher = join(root, "publisher");
    const observer = join(root, "observer");
    execFileSync("git", ["init", "--bare", "--initial-branch", "main", remote]);
    execFileSync("git", ["clone", remote, publisher]);
    git(publisher, "config", "user.name", "Publisher");
    git(publisher, "config", "user.email", "publisher@example.invalid");
    commitFile(publisher, "first\n", "first");
    git(publisher, "push", "-u", "origin", "main");
    execFileSync("git", ["clone", remote, observer]);

    commitFile(publisher, "second\n", "second");
    git(publisher, "push");
    const plan = await planGitFastForward(observer);
    expect(plan.files).toEqual(["library.txt"]);
    expect(readText(observer)).toBe("first\n");
    expect(await inspectGitFastForwardPlan(plan, readText)).toBe("second\n");
    expect(readText(observer)).toBe("first\n");

    await applyGitFastForwardPlan(plan);
    expect(readText(observer)).toBe("second\n");

    const stale = await planGitFastForward(observer);
    commitFile(publisher, "third\n", "third");
    git(publisher, "push");
    await expect(applyGitFastForwardPlan(stale)).rejects.toThrow("changed after review");
    expect(readText(observer)).toBe("second\n");
  }, 60_000);
});
