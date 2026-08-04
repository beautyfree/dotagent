import { afterEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { GitDependencyResolver, type GitRunner } from "../src/git-resolver.js";
import { SourceReleaseAgeError, SourceTrustError, exactSourceSecurityPolicy } from "../src/source-policy.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function createRepository(): { root: string; commit: string } {
  const root = mkdtempSync(join(tmpdir(), "dotagents-source-"));
  roots.push(root);
  execFileSync("git", ["init", root]);
  execFileSync("git", ["config", "user.email", "test@dotagents.local"], { cwd: root });
  execFileSync("git", ["config", "user.name", "dotagents test"], { cwd: root });
  mkdirSync(join(root, "skills/writing"), { recursive: true });
  writeFileSync(join(root, "skills/writing/SKILL.md"), "# Writing\n");
  writeFileSync(
    join(root, "skills.json"),
    JSON.stringify({
      schema_version: 1,
      name: "source",
      version: "1.0.0",
      skills: ["skills/writing"],
      dependencies: {},
    }),
  );
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-m", "fixture"], { cwd: root });
  return { root, commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim() };
}

function trustedLocalSource(root: string) {
  return exactSourceSecurityPolicy([pathToFileURL(root).href]);
}

describe("Git dependency resolver", () => {
  it("rejects an untrusted source before invoking Git", async () => {
    let calls = 0;
    const git: GitRunner = {
      async run() {
        calls += 1;
        throw new Error("Git must not run for an untrusted source");
      },
    };
    const resolver = new GitDependencyResolver({ git });
    await expect(
      resolver.resolve("source", { url: "https://github.com/untrusted/skills", ref: "main" }),
    ).rejects.toBeInstanceOf(SourceTrustError);
    expect(calls).toBe(0);
  });

  it("pins a local Git source and audits selected skills in isolation", async () => {
    const repository = createRepository();
    const temporaryRoot = mkdtempSync(join(tmpdir(), "dotagents-resolver-cache-"));
    roots.push(temporaryRoot);
    const resolver = new GitDependencyResolver({ temporaryRoot, sourcePolicy: trustedLocalSource(repository.root) });
    const result = await resolver.resolve("source", { url: pathToFileURL(repository.root).href, ref: "HEAD" });
    expect(result).toMatchObject({
      commit: repository.commit,
      requested_ref: "HEAD",
      skills: [{ name: "writing", path: "skills/writing" }],
    });
    expect(result.integrity).toMatch(/^sha256-/);
  });

  it("reuses a disposable mirror while still resolving the requested ref", async () => {
    const repository = createRepository();
    const temporaryRoot = mkdtempSync(join(tmpdir(), "dotagents-resolver-work-"));
    const cacheRoot = mkdtempSync(join(tmpdir(), "dotagents-resolver-cache-"));
    roots.push(temporaryRoot, cacheRoot);
    const resolver = new GitDependencyResolver({
      temporaryRoot,
      cacheRoot,
      sourcePolicy: trustedLocalSource(repository.root),
    });
    const dependency = { url: pathToFileURL(repository.root).href, ref: "HEAD" };
    const first = await resolver.resolve("source", dependency);
    const second = await resolver.resolve("source", dependency);
    expect(second.commit).toBe(first.commit);
    expect(second.integrity).toBe(first.integrity);
    expect(readdirSync(cacheRoot).filter((entry) => entry.endsWith(".git"))).toHaveLength(1);
  });

  it("prepares an exact locked checkout from the local mirror and repairs a tampered cache", async () => {
    const repository = createRepository();
    const temporaryRoot = mkdtempSync(join(tmpdir(), "dotagents-locked-work-"));
    const cacheRoot = mkdtempSync(join(tmpdir(), "dotagents-locked-git-"));
    const checkoutRoot = mkdtempSync(join(tmpdir(), "dotagents-locked-checkouts-"));
    roots.push(temporaryRoot, cacheRoot, checkoutRoot);
    const resolver = new GitDependencyResolver({
      temporaryRoot,
      cacheRoot,
      sourcePolicy: trustedLocalSource(repository.root),
    });
    const dependency = { url: pathToFileURL(repository.root).href, ref: "HEAD" };
    const locked = await resolver.resolve("source", dependency);
    rmSync(repository.root, { recursive: true, force: true });
    const prepared = await resolver.prepareLocked("source", dependency, locked, checkoutRoot);
    expect(prepared.commit).toBe(repository.commit);
    expect(readFileSync(join(prepared.root, "skills/writing/SKILL.md"), "utf8")).toContain("# Writing");
    writeFileSync(join(prepared.root, "skills/writing/SKILL.md"), "tampered\n");
    const repaired = await resolver.prepareLocked("source", dependency, locked, checkoutRoot);
    expect(repaired.root).toBe(prepared.root);
    expect(readFileSync(join(repaired.root, "skills/writing/SKILL.md"), "utf8")).toContain("# Writing");
    expect(existsSync(repaired.root)).toBe(true);
  });

  it("resolves an explicitly selected repository-root skill from SKILL.md metadata", async () => {
    const root = mkdtempSync(join(tmpdir(), "dotagents-root-source-"));
    roots.push(root);
    execFileSync("git", ["init", root]);
    execFileSync("git", ["config", "user.email", "test@dotagents.local"], { cwd: root });
    execFileSync("git", ["config", "user.name", "dotagents test"], { cwd: root });
    writeFileSync(join(root, "SKILL.md"), "---\nname: root-skill\ndescription: Root package.\n---\n# Root\n");
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-m", "root fixture"], { cwd: root });
    const temporaryRoot = mkdtempSync(join(tmpdir(), "dotagents-root-work-"));
    roots.push(temporaryRoot);
    const resolver = new GitDependencyResolver({ temporaryRoot, sourcePolicy: trustedLocalSource(root) });
    const result = await resolver.resolve("root-source", { url: pathToFileURL(root).href, ref: "HEAD", select: ["."] });
    expect(result.skills).toEqual([{ name: "root-skill", path: "." }]);
  });

  it("resolves a reviewed wildcard selection and preserves exclusion evidence", async () => {
    const repository = createRepository();
    mkdirSync(join(repository.root, "skills/review"), { recursive: true });
    writeFileSync(join(repository.root, "skills/review/SKILL.md"), "---\nname: review\n---\n# Review\n");
    mkdirSync(join(repository.root, "skills/private"), { recursive: true });
    writeFileSync(join(repository.root, "skills/private/SKILL.md"), "---\nname: private\n---\n# Private\n");
    execFileSync("git", ["add", "."], { cwd: repository.root });
    execFileSync("git", ["commit", "-m", "add wildcard fixtures"], { cwd: repository.root });
    const resolver = new GitDependencyResolver({ sourcePolicy: trustedLocalSource(repository.root) });
    const dependency = {
      url: pathToFileURL(repository.root).href,
      ref: "HEAD",
      subtree: "skills",
      include: ["*"],
      exclude: ["private"],
    };
    const result = await resolver.resolve("source", dependency);
    expect(result.skills.map((skill) => skill.name)).toEqual(["review", "writing"]);
    expect(result.selection).toMatchObject({
      subtree: "skills",
      include: ["*"],
      exclude: ["private"],
      excluded: expect.arrayContaining([{ path: "skills/private", reason: "excluded", matched_pattern: "private" }]),
    });
    const checkoutRoot = mkdtempSync(join(tmpdir(), "dotagents-wildcard-checkout-"));
    roots.push(checkoutRoot);
    await expect(
      resolver.prepareLocked("source", { ...dependency, exclude: [] }, result, checkoutRoot),
    ).rejects.toThrow(/wildcard selection/i);
  });

  it("blocks a reviewed source whose resolved commit has not cooled off", async () => {
    const repository = createRepository();
    const committedAt = execFileSync("git", ["show", "-s", "--format=%cI", repository.commit], {
      cwd: repository.root,
      encoding: "utf8",
    }).trim();
    const now = new Date(Date.parse(committedAt) + 30 * 60_000);
    const resolver = new GitDependencyResolver({
      sourcePolicy: exactSourceSecurityPolicy([pathToFileURL(repository.root).href], {
        minimum_release_age_minutes: 60,
      }),
      now: () => now,
    });
    await expect(
      resolver.resolve("source", { url: pathToFileURL(repository.root).href, ref: "HEAD" }),
    ).rejects.toBeInstanceOf(SourceReleaseAgeError);
  });
});
