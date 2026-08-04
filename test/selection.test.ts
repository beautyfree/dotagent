import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { discoverSkillPaths, planWildcardSelection } from "../src/selection.js";

const temporary: string[] = [];

afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("reviewed wildcard selection", () => {
  test("shows included, excluded, and unmatched skills deterministically", () => {
    const plan = planWildcardSelection({
      source: "https://github.com/example/skills",
      revision: "a".repeat(40),
      subtree: "skills",
      available: ["skills/web/react", "skills/web/vue", "skills/mobile/swift"],
      include: ["**/*"],
      exclude: ["web/vue"],
    });
    expect(plan.selected).toEqual(["skills/mobile/swift", "skills/web/react"]);
    expect(plan.entries.find((entry) => entry.path === "skills/web/vue")).toMatchObject({
      selected: false,
      reason: "excluded",
      matchedPattern: "web/vue",
    });
    const changed = planWildcardSelection({
      source: "https://github.com/example/skills",
      revision: "a".repeat(40),
      subtree: "skills",
      available: ["skills/web/react", "skills/web/vue", "skills/mobile/swift", "skills/data/sql"],
      include: ["**/*"],
      exclude: ["web/vue"],
    });
    expect(changed.indexIntegrity).not.toBe(plan.indexIntegrity);
    expect(changed.planId).not.toBe(plan.planId);
  });

  test("rejects traversal and paths outside the declared subtree", () => {
    expect(() =>
      planWildcardSelection({
        source: "source",
        revision: "revision",
        subtree: "skills",
        available: ["outside/skill"],
        include: ["**"],
      }),
    ).toThrow(/escapes/i);
    expect(() =>
      planWildcardSelection({
        source: "source",
        revision: "revision",
        available: ["safe"],
        include: ["../**"],
      }),
    ).toThrow(/subtree/i);
  });

  test("discovers SKILL.md directories without following linked trees", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "dotagents-selection-"));
    temporary.push(root);
    mkdirSync(path.join(root, "skills/alpha"), { recursive: true });
    writeFileSync(path.join(root, "skills/alpha/SKILL.md"), "# Alpha\n");
    const outside = mkdtempSync(path.join(tmpdir(), "dotagents-selection-outside-"));
    temporary.push(outside);
    writeFileSync(path.join(outside, "SKILL.md"), "# Outside\n");
    symlinkSync(outside, path.join(root, "skills/linked"), "dir");
    expect(await discoverSkillPaths(root)).toEqual(["skills/alpha"]);
  });
});
