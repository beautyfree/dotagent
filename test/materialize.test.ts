import { describe, expect, it } from "bun:test";
import type { AgentDescriptor } from "../src/agents.js";
import type { LibraryInventory } from "../src/inventory.js";
import { planMaterialization } from "../src/materialize.js";

const descriptor: AgentDescriptor = {
  slug: "codex",
  displayName: "Codex",
  platforms: ["darwin", "linux", "win32"],
  detection: [{ kind: "command", command: "codex" }],
  skills: [{ kind: "per-skill-link", roots: ["~/.codex/skills"] }],
};

const inventory: LibraryInventory = {
  root: "/library",
  name: "personal",
  version: "1.0.0",
  ownedSkills: [{ name: "writing", path: "skills/writing", fileCount: 1, bytes: 10, integrity: "sha256-example" }],
  dependencyCount: 0,
  locked: false,
};

describe("materialization planning", () => {
  it("is deterministic and creates per-skill links", () => {
    const target = { descriptor, platform: "darwin" as const, detected: true, mode: "symlink" as const, root: "/agents/codex", existing: {} };
    const first = planMaterialization(inventory, [target]);
    const second = planMaterialization(inventory, [target]);
    expect(first.planId).toBe(second.planId);
    expect(first.operations[0]).toMatchObject({ action: "create-symlink", skill: "writing" });
  });

  it("never overwrites unmanaged content", () => {
    const copyDescriptor = { ...descriptor, skills: [{ kind: "copy-only" as const, roots: ["~/.codex/skills"] }] };
    const plan = planMaterialization(inventory, [{
      descriptor: copyDescriptor,
      platform: "linux",
      detected: true,
      mode: "copy",
      root: "/agents/codex",
      existing: { writing: { state: "unmanaged" } },
    }]);
    expect(plan.hasConflicts).toBe(true);
    expect(plan.operations[0]?.action).toBe("conflict");
  });

  it("uses native shared access without inventing an agent target path", () => {
    const nativeDescriptor = { ...descriptor, skills: [{ kind: "native-shared" as const }] };
    const plan = planMaterialization(inventory, [{ descriptor: nativeDescriptor, platform: "win32", detected: true, mode: "native", existing: {} }]);
    expect(plan.operations[0]).toMatchObject({ action: "available-native", target: null });
  });
});
