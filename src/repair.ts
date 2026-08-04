import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { DoctorReport } from "./doctor.js";
import { applyLibraryUpdatePlan, planLibraryUpdate, type ApplyLibraryUpdateResult } from "./library-update.js";
import { computePlanId } from "./plan.js";

export type DoctorRepairAction = {
  kind: "update-gitignore";
  path: ".gitignore";
  add: string[];
  expectedSha256: string;
  nextSha256: string;
};

export interface DoctorRepairPlan {
  kind: "doctor-repair";
  schemaVersion: 1;
  planId: string;
  actions: DoctorRepairAction[];
  unsupported: { code: string; reason: string }[];
  hasBlockers: boolean;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function currentGitignore(root: string): string {
  const file = path.join(path.resolve(root), ".gitignore");
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function repairedGitignore(current: string): string {
  const original = current.split(/\r?\n/);
  const normalized = new Set(original.map((line) => line.trim().replace(/^\//, "")));
  const additions = ["dotagents.local.yaml", ".dotagents/"].filter((line) => !normalized.has(line));
  if (additions.length === 0) return current;
  const prefix = current.length === 0 || current.endsWith("\n") ? current : `${current}\n`;
  return `${prefix}${additions.join("\n")}\n`;
}

/** Convert only explicitly selected, deterministic doctor findings into a no-write plan. */
export function planDoctorRepair(report: DoctorReport, selectedCodes: string[]): DoctorRepairPlan {
  const selected = new Set(selectedCodes);
  const present = new Set(report.issues.map((issue) => issue.code));
  for (const code of selected) {
    if (!present.has(code as never)) throw new Error(`Selected repair finding is no longer present: ${code}`);
  }
  const actions: DoctorRepairAction[] = [];
  const unsupported: DoctorRepairPlan["unsupported"] = [];
  for (const code of [...selected].sort()) {
    if (code !== "local-state-not-ignored") {
      unsupported.push({ code, reason: "This finding requires a separate manual or source-resolution review" });
      continue;
    }
    const current = currentGitignore(report.root);
    const next = repairedGitignore(current);
    if (current !== next) {
      actions.push({
        kind: "update-gitignore",
        path: ".gitignore",
        add: ["dotagents.local.yaml", ".dotagents/"],
        expectedSha256: sha256(current),
        nextSha256: sha256(next),
      });
    }
  }
  const data = {
    kind: "doctor-repair" as const,
    schemaVersion: 1 as const,
    actions,
    unsupported,
    hasBlockers: unsupported.length > 0,
  };
  return { ...data, planId: computePlanId(data) };
}

/** Apply only the unchanged repair plan through the regular transactional update engine. */
export function applyDoctorRepair(
  root: string,
  plan: DoctorRepairPlan,
  expectedPlanId: string,
): ApplyLibraryUpdateResult | null {
  const { planId, ...payload } = plan;
  if (!expectedPlanId || planId !== expectedPlanId || computePlanId(payload) !== planId) {
    throw new Error("Doctor Repair plan is stale or modified");
  }
  if (plan.hasBlockers) throw new Error("Doctor Repair plan contains unsupported findings");
  const action = plan.actions[0];
  if (!action) return null;
  const current = currentGitignore(root);
  const next = repairedGitignore(current);
  if (sha256(current) !== action.expectedSha256 || sha256(next) !== action.nextSha256) {
    throw new Error("Doctor Repair target changed after review");
  }
  const update = planLibraryUpdate({ root, skills: [], portableFiles: { ".gitignore": next } });
  return applyLibraryUpdatePlan(update, {
    portableFiles: { ".gitignore": next },
    historyOperation: "doctor-repair",
  });
}
