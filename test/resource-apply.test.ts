import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  applyManagedResourceProjection,
  planManagedResourceProjection,
  readResourceProjectionState,
  recoverManagedResourceProjection,
  resourceProjectionJournalPath,
} from "../src/resource-apply.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(): { root: string; library: string; target: string } {
  const root = mkdtempSync(path.join(tmpdir(), "dotagents-resource-apply-"));
  roots.push(root);
  const library = path.join(root, "library");
  const target = path.join(root, "agent-native");
  mkdirSync(path.join(library, "instructions"), { recursive: true });
  mkdirSync(target, { recursive: true });
  writeFileSync(path.join(library, "instructions/team.md"), "# Team rules\n");
  return { root, library, target };
}

function instruction(targetPath = "rules/dotagents-team.md") {
  return {
    resource: "instruction:team-rules" as const,
    kind: "instruction" as const,
    sourcePath: "instructions/team.md",
    targetPath,
    support: "native" as const,
    adapter: "instruction-file",
  };
}

describe("managed resource projection", () => {
  test("writes one reviewed file and preserves every unmanaged sibling", async () => {
    const current = fixture();
    mkdirSync(path.join(current.target, "rules"), { recursive: true });
    writeFileSync(path.join(current.target, "rules/user-owned.md"), "do not touch\n");
    writeFileSync(path.join(current.target, "native-config.json"), '{"user":true}\n');

    const plan = await planManagedResourceProjection({
      library: current.library,
      agent: "example",
      targetRoot: current.target,
      resources: [instruction()],
    });
    expect(plan.hasConflicts).toBe(false);
    expect(plan.operations[0]?.action).toBe("create");
    await applyManagedResourceProjection(plan);

    expect(readFileSync(path.join(current.target, "rules/dotagents-team.md"), "utf8")).toBe("# Team rules\n");
    expect(readFileSync(path.join(current.target, "rules/user-owned.md"), "utf8")).toBe("do not touch\n");
    expect(readFileSync(path.join(current.target, "native-config.json"), "utf8")).toBe('{"user":true}\n');
    expect(Object.keys((await readResourceProjectionState(current.library)).targets)).toEqual([
      path.join(current.target, "rules/dotagents-team.md"),
    ]);
  });

  test("never adopts or overwrites an existing unmanaged target", async () => {
    const current = fixture();
    mkdirSync(path.join(current.target, "rules"), { recursive: true });
    writeFileSync(path.join(current.target, "rules/dotagents-team.md"), "user version\n");
    const plan = await planManagedResourceProjection({
      library: current.library,
      agent: "example",
      targetRoot: current.target,
      resources: [instruction()],
    });
    expect(plan.operations[0]).toMatchObject({ action: "conflict", reason: "Target contains unmanaged content" });
    await expect(applyManagedResourceProjection(plan)).rejects.toThrow("contains conflicts");
    expect(readFileSync(path.join(current.target, "rules/dotagents-team.md"), "utf8")).toBe("user version\n");
  });

  test("requires an explicit reviewed acceptance for lossy adapters", async () => {
    const current = fixture();
    const lossy = {
      ...instruction(),
      support: "lossy" as const,
      loss: "Conditional activation becomes always-on",
    };
    const blocked = await planManagedResourceProjection({
      library: current.library,
      agent: "example",
      targetRoot: current.target,
      resources: [lossy],
    });
    expect(blocked.operations[0]?.reason).toContain("requires explicit review");
    const accepted = await planManagedResourceProjection({
      library: current.library,
      agent: "example",
      targetRoot: current.target,
      resources: [lossy],
      acceptedLossyResources: ["instruction:team-rules"],
    });
    expect(accepted.hasConflicts).toBe(false);
    await applyManagedResourceProjection(accepted);
    expect(existsSync(path.join(current.target, "rules/dotagents-team.md"))).toBe(true);
  });

  test("updates its own unchanged target but blocks local edits", async () => {
    const current = fixture();
    const first = await planManagedResourceProjection({
      library: current.library,
      agent: "example",
      targetRoot: current.target,
      resources: [instruction()],
    });
    await applyManagedResourceProjection(first);
    writeFileSync(path.join(current.library, "instructions/team.md"), "# Updated rules\n");
    const update = await planManagedResourceProjection({
      library: current.library,
      agent: "example",
      targetRoot: current.target,
      resources: [instruction()],
    });
    expect(update.operations[0]?.action).toBe("update");
    await applyManagedResourceProjection(update);
    writeFileSync(path.join(current.target, "rules/dotagents-team.md"), "local edit\n");
    writeFileSync(path.join(current.library, "instructions/team.md"), "# Another update\n");
    const conflict = await planManagedResourceProjection({
      library: current.library,
      agent: "example",
      targetRoot: current.target,
      resources: [instruction()],
    });
    expect(conflict.operations[0]).toMatchObject({ action: "conflict", reason: "Managed target has local changes" });
  });

  test("rejects changed reviewed input before writing", async () => {
    const current = fixture();
    const plan = await planManagedResourceProjection({
      library: current.library,
      agent: "example",
      targetRoot: current.target,
      resources: [instruction()],
    });
    writeFileSync(path.join(current.library, "instructions/team.md"), "changed after review\n");
    await expect(applyManagedResourceProjection(plan)).rejects.toThrow("source changed after review");
    expect(existsSync(path.join(current.target, "rules/dotagents-team.md"))).toBe(false);
  });

  test("rolls back earlier files when a later adapter write fails", async () => {
    const current = fixture();
    writeFileSync(path.join(current.library, "instructions/second.md"), "# Second\n");
    const plan = await planManagedResourceProjection({
      library: current.library,
      agent: "example",
      targetRoot: current.target,
      resources: [
        instruction("rules/first.md"),
        {
          resource: "instruction:second",
          kind: "instruction",
          sourcePath: "instructions/second.md",
          targetPath: "rules/second.md",
          support: "native",
          adapter: "instruction-file",
        },
      ],
    });
    await expect(
      applyManagedResourceProjection(plan, {
        beforeOperation: (_operation, index) => {
          if (index === 1) throw new Error("simulated adapter failure");
        },
      }),
    ).rejects.toThrow("simulated adapter failure");
    expect(existsSync(path.join(current.target, "rules/first.md"))).toBe(false);
    expect(existsSync(path.join(current.target, "rules/second.md"))).toBe(false);
    expect((await readResourceProjectionState(current.library)).targets).toEqual({});
  });

  test("blocks possible secrets without serializing the matched value", async () => {
    const current = fixture();
    const secret = `postgres://user:${"p" + "assword"}@database.example/app`;
    writeFileSync(path.join(current.library, "instructions/team.md"), secret);
    const plan = await planManagedResourceProjection({
      library: current.library,
      agent: "example",
      targetRoot: current.target,
      resources: [instruction()],
    });
    expect(plan.operations[0]).toMatchObject({
      action: "conflict",
      reason: "Resource contains possible secrets and requires remediation before projection",
      secretFindings: [{ rule: "connection-string", line: 1, column: 1 }],
    });
    expect(JSON.stringify(plan)).not.toContain(secret);
  });

  test("recovers a crash during commit without touching sibling files", async () => {
    const current = fixture();
    writeFileSync(path.join(current.target, "user-owned.md"), "keep me\n");
    const plan = await planManagedResourceProjection({
      library: current.library,
      agent: "example",
      targetRoot: current.target,
      resources: [instruction()],
    });
    const operation = plan.operations[0];
    if (!operation) throw new Error("fixture produced no resource operation");
    mkdirSync(path.dirname(operation.target), { recursive: true });
    writeFileSync(operation.target, readFileSync(operation.source));
    mkdirSync(path.dirname(resourceProjectionJournalPath(current.library)), { recursive: true });
    writeFileSync(
      resourceProjectionJournalPath(current.library),
      JSON.stringify({
        kind: "managed-resource-projection",
        schemaVersion: 1,
        planId: plan.planId,
        library: current.library,
        phase: "applying",
        previousState: { schemaVersion: 1, targets: {} },
        operations: [{ operation, status: "committing" }],
      }),
    );
    expect(await recoverManagedResourceProjection(current.library)).toBe(true);
    expect(existsSync(operation.target)).toBe(false);
    expect(readFileSync(path.join(current.target, "user-owned.md"), "utf8")).toBe("keep me\n");
    expect(await recoverManagedResourceProjection(current.library)).toBe(false);
  });
});
