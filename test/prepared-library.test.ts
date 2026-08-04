import { afterEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { applyInitializeLibraryPlan, planInitializeLibrary } from "../src/init.js";
import { GitDependencyResolver } from "../src/git-resolver.js";
import { exactSourceSecurityPolicy } from "../src/source-policy.js";
import { applyMaterializationPlan } from "../src/materialize-apply.js";
import { planMaterialization } from "../src/materialize.js";
import { prepareMaterializationInventory } from "../src/prepared-library.js";
import { applyResolutionPlan, planResolveDependencies } from "../src/sources.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("prepared dependency library", () => {
  it("materializes owned and locked dependency skills through the same safe plan", async () => {
    const root = mkdtempSync(join(tmpdir(), "dotagents-prepared-library-"));
    const source = mkdtempSync(join(tmpdir(), "dotagents-prepared-source-"));
    const target = mkdtempSync(join(tmpdir(), "dotagents-prepared-target-"));
    roots.push(root, source, target);
    await applyInitializeLibraryPlan(planInitializeLibrary(root, "portable-library"));
    execFileSync("git", ["init", source]);
    execFileSync("git", ["config", "user.email", "test@dotagents.local"], { cwd: source });
    execFileSync("git", ["config", "user.name", "dotagents test"], { cwd: source });
    mkdirSync(join(source, "skills/review"), { recursive: true });
    writeFileSync(
      join(source, "skills/review/SKILL.md"),
      "---\nname: review\ndescription: Reviews code.\n---\n# Review\n",
    );
    writeFileSync(
      join(source, "skills.json"),
      JSON.stringify({
        schema_version: 1,
        name: "review-source",
        version: "1.0.0",
        skills: ["skills/review"],
        dependencies: {},
      }),
    );
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-m", "source"], { cwd: source });
    const dependency = { url: pathToFileURL(source).href, ref: "HEAD" };
    const manifest = {
      schema_version: 1 as const,
      name: "portable-library",
      version: "0.1.0",
      skills: [],
      dependencies: { review: dependency },
    };
    writeFileSync(join(root, "skills.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const resolver = new GitDependencyResolver({
      cacheRoot: join(root, ".dotagents/cache/git"),
      sourcePolicy: exactSourceSecurityPolicy([dependency.url]),
    });
    const resolution = await planResolveDependencies(manifest, resolver);
    await applyResolutionPlan(root, resolution);

    const inventory = await prepareMaterializationInventory({ root, resolver });
    expect(inventory.ownedSkills).toHaveLength(1);
    expect(inventory.ownedSkills[0]).toMatchObject({ name: "review", sourceKind: "dependency", dependency: "review" });
    const plan = planMaterialization(inventory, [
      {
        descriptor: {
          slug: "fixture",
          displayName: "Fixture",
          platforms: [process.platform as "darwin" | "linux" | "win32"],
          detection: [],
          skills: [{ kind: "copy-only", roots: [target] }],
        },
        platform: process.platform as "darwin" | "linux" | "win32",
        detected: true,
        mode: "copy",
        root: target,
        existing: {},
      },
    ]);
    expect(plan.operations[0]).toMatchObject({ skill: "review", action: "create-copy" });
    await applyMaterializationPlan(plan);
    expect(existsSync(join(target, "review", "SKILL.md"))).toBe(true);
    expect(readFileSync(join(target, "review", "SKILL.md"), "utf8")).toContain("Reviews code");
  });
});
