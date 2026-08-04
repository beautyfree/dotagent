import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { listOperationHistory } from "../src/history.js";
import type { LibraryFiles } from "../src/library.js";
import {
  applyLegacyScopeMigrationPlan,
  createLegacyScopeMigrationPlan,
  createScopeCompositionPlan,
  readPortableScopeDescriptor,
  SCOPE_DESCRIPTOR_FILE,
} from "../src/scope.js";

const temporary: string[] = [];

afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function library(name: string, skills: Record<string, string>): LibraryFiles {
  const root = mkdtempSync(path.join(tmpdir(), `dotagents-scope-${name}-`));
  temporary.push(root);
  for (const [skill, body] of Object.entries(skills)) {
    const directory = path.join(root, skill);
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, "SKILL.md"), `---\nname: ${skill}\n---\n\n${body}\n`, "utf8");
  }
  return {
    root,
    manifest: {
      schema_version: 1,
      name,
      version: "1.0.0",
      skills: Object.keys(skills),
      dependencies: {},
    },
    lock: null,
  };
}

describe("Personal, Project, and Device scope composition", () => {
  test("combines Personal and Project resources without serializing device paths", async () => {
    const personal = library("personal-kit", { alpha: "Personal alpha" });
    const project = library("project-kit", { beta: "Project beta" });
    const plan = await createScopeCompositionPlan(
      [
        { scope: "personal", library: personal },
        { scope: "project", library: project },
      ],
      { exclusions: ["skill:beta"] },
    );

    expect(plan.hasBlockers).toBe(false);
    expect(plan.resources.map((resource) => [resource.key, resource.excludedByDevice])).toEqual([
      ["skill:alpha", false],
      ["skill:beta", true],
    ]);
    const review = JSON.stringify(plan);
    expect(review).not.toContain(personal.root);
    expect(review).not.toContain(project.root);
  });

  test("deduplicates equal immutable content but blocks unequal same-id resources", async () => {
    const equalPersonal = library("personal-equal", { shared: "Same content" });
    const equalProject = library("project-equal", { shared: "Same content" });
    const equal = await createScopeCompositionPlan([
      { scope: "personal", library: equalPersonal },
      { scope: "project", library: equalProject },
    ]);
    expect(equal.hasBlockers).toBe(false);
    expect(equal.resources).toHaveLength(1);
    expect(equal.resources[0]?.origins).toHaveLength(2);

    const changedProject = library("project-changed", { shared: "Different content" });
    const conflict = await createScopeCompositionPlan([
      { scope: "personal", library: equalPersonal },
      { scope: "project", library: changedProject },
    ]);
    expect(conflict.hasBlockers).toBe(true);
    expect(conflict.resources).toHaveLength(0);
    expect(conflict.conflicts.map((entry) => entry.resourceKey)).toEqual(["skill:shared"]);
  });

  test("removing Project scope leaves Personal resources unchanged", async () => {
    const personal = library("personal-only", { alpha: "Personal alpha" });
    const project = library("temporary-project", { beta: "Project beta" });
    const combined = await createScopeCompositionPlan([
      { scope: "personal", library: personal },
      { scope: "project", library: project },
    ]);
    const afterRemoval = await createScopeCompositionPlan([{ scope: "personal", library: personal }]);
    expect(combined.resources.find((entry) => entry.id === "alpha")?.origins).toEqual(
      afterRemoval.resources.find((entry) => entry.id === "alpha")?.origins,
    );
    expect(afterRemoval.resources.map((entry) => entry.id)).toEqual(["alpha"]);
  });

  test("composes versioned instructions, commands, and subagents by exact kind identity", async () => {
    const personal = library("personal-resources", { shared: "Personal skill" });
    const project = library("project-resources", { shared: "Project skill" });
    mkdirSync(path.join(personal.root, "instructions"), { recursive: true });
    mkdirSync(path.join(project.root, "commands"), { recursive: true });
    mkdirSync(path.join(project.root, "subagents"), { recursive: true });
    writeFileSync(path.join(personal.root, "instructions/shared.md"), "# Personal rules\n", "utf8");
    writeFileSync(path.join(project.root, "commands/shared.md"), "# Project command\n", "utf8");
    writeFileSync(path.join(project.root, "subagents/reviewer.md"), "# Reviewer\n", "utf8");
    writeFileSync(
      path.join(personal.root, "resources.json"),
      JSON.stringify({
        schema_version: 2,
        resources: [
          {
            kind: "instruction",
            id: "shared",
            path: "instructions/shared.md",
            format: "markdown",
            activation: "always",
          },
        ],
      }),
    );
    writeFileSync(
      path.join(project.root, "resources.json"),
      JSON.stringify({
        schema_version: 2,
        resources: [
          { kind: "command", id: "shared", path: "commands/shared.md", format: "markdown", invocation: "shared" },
          { kind: "subagent", id: "reviewer", path: "subagents/reviewer.md", format: "markdown", role: "Reviewer" },
        ],
      }),
    );
    const plan = await createScopeCompositionPlan(
      [
        { scope: "personal", library: personal },
        { scope: "project", library: project },
      ],
      { exclusions: ["command:shared"] },
    );
    expect(plan.resources.map((resource) => resource.key)).toEqual([
      "command:shared",
      "instruction:shared",
      "subagent:reviewer",
    ]);
    expect(plan.resources.find((resource) => resource.key === "command:shared")?.excludedByDevice).toBe(true);
    expect(plan.conflicts.map((entry) => entry.resourceKey)).toEqual(["skill:shared"]);
  });

  test("keeps legacy migration preview-only until the scope is explicitly chosen and reviewed", async () => {
    const legacy = library("legacy-kit", { alpha: "Legacy" });
    const undecided = await createLegacyScopeMigrationPlan(legacy);
    expect(undecided.status).toBe("requires-decision");
    expect(undecided.descriptor).toBeNull();
    expect(existsSync(path.join(legacy.root, SCOPE_DESCRIPTOR_FILE))).toBe(false);

    const reviewed = await createLegacyScopeMigrationPlan(legacy, "personal");
    expect(reviewed.status).toBe("ready");
    expect(reviewed.descriptor).toEqual({ schema_version: 1, scope: "personal" });
    expect(existsSync(path.join(legacy.root, SCOPE_DESCRIPTOR_FILE))).toBe(false);

    const applied = await applyLegacyScopeMigrationPlan(legacy, reviewed, reviewed.planId);
    expect(applied.historyId).toBeString();
    expect(readPortableScopeDescriptor(legacy.root)).toEqual({ schema_version: 1, scope: "personal" });
    expect(JSON.parse(readFileSync(path.join(legacy.root, SCOPE_DESCRIPTOR_FILE), "utf8"))).toEqual(
      reviewed.descriptor,
    );
    expect(listOperationHistory(legacy.root)[0]?.operation).toBe("scope-migration");
    await expect(createLegacyScopeMigrationPlan(legacy, "project")).rejects.toThrow("already declares");
  });

  test("rejects a migration when the reviewed portable library changes", async () => {
    const legacy = library("stale-kit", { alpha: "Legacy" });
    const reviewed = await createLegacyScopeMigrationPlan(legacy, "project");
    writeFileSync(path.join(legacy.root, "alpha", "SKILL.md"), "---\nname: alpha\n---\n\nChanged after review\n");
    await expect(applyLegacyScopeMigrationPlan(legacy, reviewed, reviewed.planId)).rejects.toThrow("stale or modified");
    expect(existsSync(path.join(legacy.root, SCOPE_DESCRIPTOR_FILE))).toBe(false);
  });
});
