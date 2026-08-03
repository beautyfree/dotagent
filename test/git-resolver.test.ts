import { afterEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { GitDependencyResolver } from "../src/git-resolver.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function createRepository(): { root: string; commit: string } {
  const root = mkdtempSync(join(tmpdir(), "dotagent-source-"));
  roots.push(root);
  execFileSync("git", ["init", root]);
  execFileSync("git", ["config", "user.email", "test@dotagent.local"], { cwd: root });
  execFileSync("git", ["config", "user.name", "dotagent test"], { cwd: root });
  mkdirSync(join(root, "skills/writing"), { recursive: true });
  writeFileSync(join(root, "skills/writing/SKILL.md"), "# Writing\n");
  writeFileSync(join(root, "skills.json"), JSON.stringify({ schema_version: 1, name: "source", version: "1.0.0", skills: ["skills/writing"], dependencies: {} }));
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-m", "fixture"], { cwd: root });
  return { root, commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim() };
}

describe("Git dependency resolver", () => {
  it("pins a local Git source and audits selected skills in isolation", async () => {
    const repository = createRepository();
    const temporaryRoot = mkdtempSync(join(tmpdir(), "dotagent-resolver-cache-"));
    roots.push(temporaryRoot);
    const resolver = new GitDependencyResolver({ temporaryRoot });
    const result = await resolver.resolve("source", { url: pathToFileURL(repository.root).href, ref: "HEAD" });
    expect(result).toMatchObject({ commit: repository.commit, requested_ref: "HEAD", skills: [{ name: "writing", path: "skills/writing" }] });
    expect(result.integrity).toMatch(/^sha256-/);
  });

  it("reuses a disposable mirror while still resolving the requested ref", async () => {
    const repository = createRepository();
    const temporaryRoot = mkdtempSync(join(tmpdir(), "dotagent-resolver-work-"));
    const cacheRoot = mkdtempSync(join(tmpdir(), "dotagent-resolver-cache-"));
    roots.push(temporaryRoot, cacheRoot);
    const resolver = new GitDependencyResolver({ temporaryRoot, cacheRoot });
    const dependency = { url: pathToFileURL(repository.root).href, ref: "HEAD" };
    const first = await resolver.resolve("source", dependency);
    const second = await resolver.resolve("source", dependency);
    expect(second.commit).toBe(first.commit);
    expect(second.integrity).toBe(first.integrity);
    expect(readdirSync(cacheRoot).filter((entry) => entry.endsWith(".git"))).toHaveLength(1);
  });
});
