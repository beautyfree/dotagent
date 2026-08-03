import { describe, expect, test } from "bun:test";
import { computeSkillIntegrity } from "../src/integrity.js";

describe("skill integrity", () => {
  test("is deterministic across input order and path separators", () => {
    const first = computeSkillIntegrity([
      { path: "skill/SKILL.md", content: Buffer.from("instructions") },
      { path: "skill/scripts/check.js", content: Buffer.from("check") },
    ]);
    const second = computeSkillIntegrity([
      { path: "skill\\scripts\\check.js", content: Buffer.from("check") },
      { path: "skill/SKILL.md", content: Buffer.from("instructions") },
    ]);
    expect(second).toBe(first);
  });

  test("rejects paths outside the skill root", () => {
    expect(() => computeSkillIntegrity([{ path: "../secret", content: Buffer.from("x") }])).toThrow(
      "Unsafe integrity path",
    );
  });
});
