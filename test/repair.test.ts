import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { doctorLibrary } from "../src/doctor.js";
import { listOperationHistory } from "../src/history.js";
import { applyDoctorRepair, planDoctorRepair } from "../src/repair.js";

const temporary: string[] = [];

afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function brokenLibrary(): string {
  const root = mkdtempSync(path.join(tmpdir(), "dotagents-repair-"));
  temporary.push(root);
  mkdirSync(path.join(root, "skills/writing"), { recursive: true });
  writeFileSync(path.join(root, "skills/writing/SKILL.md"), "---\nname: writing\n---\n\nWrite.\n");
  writeFileSync(
    path.join(root, "skills.json"),
    JSON.stringify({ schema_version: 1, name: "repair-test", version: "1.0.0", skills: ["skills/writing"] }),
  );
  writeFileSync(path.join(root, "dotagents.yaml"), "schema_version: 1\n");
  writeFileSync(path.join(root, ".gitignore"), "node_modules/\n");
  return root;
}

describe("reviewed Doctor Repair", () => {
  test("does not mutate from a finding and applies only the confirmed plan", async () => {
    const root = brokenLibrary();
    const report = await doctorLibrary({ root });
    const plan = planDoctorRepair(report, ["local-state-not-ignored"]);
    expect(plan.hasBlockers).toBe(false);
    expect(readFileSync(path.join(root, ".gitignore"), "utf8")).toBe("node_modules/\n");

    const result = applyDoctorRepair(root, plan, plan.planId);
    expect(result?.historyId).toBeString();
    expect(listOperationHistory(root)[0]?.operation).toBe("doctor-repair");
    expect(readFileSync(path.join(root, ".gitignore"), "utf8")).toBe(
      "node_modules/\ndotagents.local.yaml\n.dotagents/\n",
    );
    expect((await doctorLibrary({ root })).issues.some((issue) => issue.code === "local-state-not-ignored")).toBe(
      false,
    );
  });

  test("rejects a changed target and unsupported automatic repair", async () => {
    const root = brokenLibrary();
    const report = await doctorLibrary({ root });
    const plan = planDoctorRepair(report, ["local-state-not-ignored"]);
    writeFileSync(path.join(root, ".gitignore"), "dist/\n", "utf8");
    expect(() => applyDoctorRepair(root, plan, plan.planId)).toThrow(/changed after review/i);

    const synthetic = {
      ...report,
      issues: [...report.issues, { code: "invalid-config" as const, message: "bad", remediation: "Fix it" }],
    };
    const unsupported = planDoctorRepair(synthetic, ["invalid-config"]);
    expect(unsupported.hasBlockers).toBe(true);
    expect(() => applyDoctorRepair(root, unsupported, unsupported.planId)).toThrow(/unsupported/i);
  });
});
