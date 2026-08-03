import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getMaterializationStatus } from "../src/status.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("materialization status", () => {
  it("reports local copy changes with a three-way planning snapshot", async () => {
    const root = mkdtempSync(join(tmpdir(), "dotagent-status-"));
    roots.push(root);
    const target = join(root, "targets/writing");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "SKILL.md"), "# Changed locally\n");
    writeFileSync(join(target, ".dotagent-managed.json"), JSON.stringify({ schemaVersion: 1, planId: "old" }));
    mkdirSync(join(root, ".dotagent"));
    writeFileSync(
      join(root, ".dotagent/materialization-state.json"),
      JSON.stringify({
        schemaVersion: 1,
        targets: {
          [target]: {
            agent: "codex",
            skill: "writing",
            mode: "copy",
            source: join(root, "skills/writing"),
            sourceIntegrity: "sha256-old",
          },
        },
      }),
    );
    const status = await getMaterializationStatus(root);
    expect(status.targets[0]).toMatchObject({ health: "locally-modified" });
    expect(status.byAgent.codex?.writing).toMatchObject({ state: "managed-copy", baseIntegrity: "sha256-old" });
  });
});
