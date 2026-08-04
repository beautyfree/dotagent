import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentDescriptor } from "../src/agents.js";
import {
  planResourceComposition,
  planResourceProjection,
  resourceManifestSchema,
  scanResourceManifest,
} from "../src/resource-model.js";

const temporary: string[] = [];

afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function library(): string {
  const root = mkdtempSync(path.join(tmpdir(), "dotagents-resources-"));
  temporary.push(root);
  mkdirSync(path.join(root, "skills/review"), { recursive: true });
  writeFileSync(path.join(root, "skills/review/SKILL.md"), "---\nname: review\n---\n# Review\n");
  mkdirSync(path.join(root, "instructions"), { recursive: true });
  writeFileSync(path.join(root, "instructions/team.md"), "# Team rules\n");
  mkdirSync(path.join(root, "commands"), { recursive: true });
  writeFileSync(path.join(root, "commands/ship.md"), "# Ship\n");
  return root;
}

describe("resource model v2", () => {
  test("scans data-only resources and rejects executable resource kinds", async () => {
    const root = library();
    const manifest = resourceManifestSchema.parse({
      schema_version: 2,
      resources: [
        { kind: "skill", id: "review", path: "skills/review" },
        {
          kind: "instruction",
          id: "team-rules",
          path: "instructions/team.md",
          format: "markdown",
          activation: "always",
        },
        { kind: "command", id: "ship", path: "commands/ship.md", format: "markdown", invocation: "ship" },
      ],
    });
    const scanned = await scanResourceManifest(root, manifest);
    expect(scanned.hasBlockers).toBe(false);
    expect(scanned.resources.map((resource) => `${resource.kind}:${resource.id}`)).toEqual([
      "command:ship",
      "instruction:team-rules",
      "skill:review",
    ]);
    expect(() =>
      resourceManifestSchema.parse({
        schema_version: 2,
        resources: [{ kind: "hook", id: "postinstall", path: "hook.sh" }],
      }),
    ).toThrow();
    expect(() =>
      resourceManifestSchema.parse({
        schema_version: 2,
        resources: [{ kind: "skill", id: "review", path: "skills/review", mcp: "run-me" }],
      }),
    ).toThrow();
  });

  test("keys collisions by kind, stable identity, and immutable content", async () => {
    const firstRoot = library();
    const secondRoot = library();
    writeFileSync(path.join(secondRoot, "instructions/team.md"), "# Different rules\n");
    const manifest = resourceManifestSchema.parse({
      schema_version: 2,
      resources: [
        {
          kind: "instruction",
          id: "team-rules",
          path: "instructions/team.md",
          format: "markdown",
          activation: "always",
        },
      ],
    });
    const [first, second] = await Promise.all([
      scanResourceManifest(firstRoot, manifest),
      scanResourceManifest(secondRoot, manifest),
    ]);
    const plan = planResourceComposition([
      { scope: "personal", library: "personal", resources: first.resources },
      { scope: "project", library: "project", resources: second.resources },
    ]);
    expect(plan.hasBlockers).toBe(true);
    expect(plan.conflicts.map((conflict) => conflict.key)).toEqual(["instruction:team-rules"]);
  });

  test("makes unsupported and lossy adapter behavior explicit before apply", () => {
    const agent: AgentDescriptor = {
      slug: "example",
      displayName: "Example",
      platforms: ["linux"],
      detection: [],
      skills: [{ kind: "copy-only", roots: ["~/.example/skills"] }],
      resources: {
        skill: { support: "native", adapter: "skills-directory" },
        instruction: {
          support: "lossy",
          adapter: "merge-single-instructions-file",
          loss: "Conditional activation becomes an always-on heading",
        },
        command: { support: "unsupported" },
        subagent: { support: "unsupported" },
      },
    };
    const resources = resourceManifestSchema.parse({
      schema_version: 2,
      resources: [
        {
          kind: "instruction",
          id: "review-rules",
          path: "instructions/review.md",
          format: "markdown",
          activation: "conditional",
          condition: "When reviewing code",
          agents: ["example"],
        },
        {
          kind: "command",
          id: "ship",
          path: "commands/ship.md",
          format: "markdown",
          invocation: "ship",
          agents: ["example"],
        },
      ],
    }).resources;
    const plan = planResourceProjection(resources, [agent]);
    expect(plan.hasLossy).toBe(true);
    expect(plan.hasUnsupported).toBe(true);
    expect(plan.projections).toContainEqual(
      expect.objectContaining({ resource: "instruction:review-rules", support: "lossy", loss: expect.any(String) }),
    );
    expect(plan.projections).toContainEqual(
      expect.objectContaining({ resource: "command:ship", support: "unsupported" }),
    );
  });
});
