import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyInitializeLibraryPlan, planInitializeLibrary } from "../src/init.js";
import { scanLibrary } from "../src/inventory.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("library initialization", () => {
  it("creates a valid empty library from a deterministic reviewed plan", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dotagent-init-"));
    roots.push(parent);
    const root = join(parent, "My Library");
    const first = planInitializeLibrary(root);
    const second = planInitializeLibrary(root);
    expect(first.planId).toBe(second.planId);
    await applyInitializeLibraryPlan(first);
    expect(JSON.parse(readFileSync(join(root, "skills.json"), "utf8")).name).toBe("my-library");
    expect((await scanLibrary(root)).ok).toBe(true);
  });

  it("rejects a modified plan and existing files", async () => {
    const root = mkdtempSync(join(tmpdir(), "dotagent-init-"));
    roots.push(root);
    const plan = planInitializeLibrary(root, "safe");
    await expect(applyInitializeLibraryPlan({ ...plan, root: join(root, "other") })).rejects.toThrow(
      "stale or modified",
    );
    writeFileSync(join(root, "skills.json"), "existing");
    await expect(applyInitializeLibraryPlan(plan)).rejects.toThrow("Refusing to overwrite");
  });
});
