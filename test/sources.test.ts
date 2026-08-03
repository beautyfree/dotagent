import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { libraryManifestSchema, type ResolvedPackage } from "../src/schema.js";
import { applyResolutionPlan, normalizeGitIdentity, planResolveDependencies, type DependencyResolver } from "../src/sources.js";

function resolved(url: string, requestedRef: string, name: string, commit: string): ResolvedPackage {
  return { url, requested_ref: requestedRef, commit, integrity: "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", skills: [{ name, path: `skills/${name}` }] };
}

describe("source resolution planning", () => {
  it("normalizes common Git transports without retaining credentials", () => {
    expect(normalizeGitIdentity("git@github.com:Owner/Repo.git")).toBe("https://github.com/Owner/Repo");
    expect(normalizeGitIdentity("https://github.com/Owner/Repo.git/")).toBe("https://github.com/Owner/Repo");
    expect(() => normalizeGitIdentity("https://user:password@example.com/repo")).toThrow("credentials");
  });

  it("resolves dependencies concurrently into a deterministic lock plan", async () => {
    const manifest = libraryManifestSchema.parse({ schema_version: 1, name: "personal", version: "1.0.0", skills: [], dependencies: {
      alpha: { url: "https://github.com/example/alpha", ref: "v1" },
      beta: { url: "git@github.com:example/beta.git", ref: "main" },
    } });
    let active = 0;
    let maximum = 0;
    const resolver: DependencyResolver = { resolve: async (name, dependency) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
      active -= 1;
      return resolved(dependency.url, dependency.ref, name, name === "alpha" ? "a".repeat(40) : "b".repeat(40));
    } };
    const plan = await planResolveDependencies(manifest, resolver);
    expect(maximum).toBe(2);
    expect(Object.keys(plan.lock.resolved)).toEqual(["alpha", "beta"]);
    expect(plan.changes.map((change) => change.action)).toEqual(["added", "added"]);
    expect(plan.planId).toHaveLength(64);
  });

  it("blocks flat skill-name collisions", async () => {
    const manifest = libraryManifestSchema.parse({ schema_version: 1, name: "personal", version: "1.0.0", skills: ["skills/writing"], dependencies: {
      community: { url: "https://github.com/example/community", ref: "main" },
    } });
    await expect(planResolveDependencies(manifest, { resolve: async (_name, dependency) => resolved(dependency.url, dependency.ref, "writing", "a".repeat(40)) }))
      .rejects.toThrow("collision");
  });

  it("writes only an unchanged reviewed manifest plan", async () => {
    const root = mkdtempSync(join(tmpdir(), "dotagent-resolution-"));
    try {
      mkdirSync(join(root, "skills"));
      const manifest = libraryManifestSchema.parse({ schema_version: 1, name: "personal", version: "1.0.0", skills: [], dependencies: {
        source: { url: "https://github.com/example/source", ref: "main" },
      } });
      writeFileSync(join(root, "skills.json"), JSON.stringify(manifest));
      const plan = await planResolveDependencies(manifest, { resolve: async (_name, dependency) => resolved(dependency.url, dependency.ref, "writing", "a".repeat(40)) });
      await applyResolutionPlan(root, plan);
      expect(JSON.parse(readFileSync(join(root, "skills.lock"), "utf8")).resolved.source.commit).toBe("a".repeat(40));
      await expect(applyResolutionPlan(root, { ...plan, manifestHash: "modified" })).rejects.toThrow("stale or modified");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
