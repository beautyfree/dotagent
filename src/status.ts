import { lstat, readlink } from "node:fs/promises";
import path from "node:path";
import { scanOwnedSkill } from "./inventory.js";
import { readMaterializationState } from "./materialize-apply.js";
import type { ExistingTarget } from "./materialize.js";

export type ManagedTargetHealth = "missing" | "current" | "locally-modified" | "link-changed" | "invalid";

export interface ManagedTargetStatus {
  target: string;
  agent: string;
  skill: string;
  mode: "symlink" | "junction" | "copy";
  health: ManagedTargetHealth;
  source: string;
  sourceIntegrity: string;
  currentIntegrity: string | null;
}

export interface MaterializationStatus {
  library: string;
  targets: ManagedTargetStatus[];
  byAgent: Record<string, Record<string, ExistingTarget>>;
}

async function pathKind(filePath: string): Promise<"missing" | "link" | "directory" | "other"> {
  try {
    const metadata = await lstat(filePath);
    if (metadata.isSymbolicLink()) return "link";
    if (metadata.isDirectory()) return "directory";
    return "other";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    throw error;
  }
}

/** Reads only dotagents-owned ledger entries; unmanaged filesystem targets are discovered by machine planning. */
export async function getMaterializationStatus(libraryRoot: string): Promise<MaterializationStatus> {
  const root = path.resolve(libraryRoot);
  const state = await readMaterializationState(root);
  const targets: ManagedTargetStatus[] = [];
  const byAgent: Record<string, Record<string, ExistingTarget>> = {};
  for (const [target, managed] of Object.entries(state.targets).sort(([left], [right]) =>
    left.localeCompare(right, "en"),
  )) {
    const kind = await pathKind(target);
    let health: ManagedTargetHealth;
    let currentIntegrity: string | null = null;
    let existing: ExistingTarget;
    if (kind === "missing") {
      health = "missing";
      existing = { state: "absent" };
    } else if (managed.mode === "copy" && kind === "directory") {
      const scanned = await scanOwnedSkill(path.dirname(target), path.basename(target));
      if (!scanned.ok) {
        health = "invalid";
        existing = { state: "unmanaged" };
      } else {
        currentIntegrity = scanned.value.integrity;
        health = currentIntegrity === managed.sourceIntegrity ? "current" : "locally-modified";
        existing = { state: "managed-copy", integrity: currentIntegrity, baseIntegrity: managed.sourceIntegrity };
      }
    } else if ((managed.mode === "symlink" || managed.mode === "junction") && kind === "link") {
      const actual = path.resolve(path.dirname(target), await readlink(target));
      health = actual === path.resolve(managed.source) ? "current" : "link-changed";
      existing = { state: "managed-link", source: actual };
    } else {
      health = "invalid";
      existing = { state: "unmanaged" };
    }
    const agentTargets = byAgent[managed.agent] ?? {};
    agentTargets[managed.skill] = existing;
    byAgent[managed.agent] = agentTargets;
    targets.push({
      target,
      agent: managed.agent,
      skill: managed.skill,
      mode: managed.mode,
      health,
      source: managed.source,
      sourceIntegrity: managed.sourceIntegrity,
      currentIntegrity,
    });
  }
  return { library: root, targets, byAgent };
}

/** Combines dotagents ownership state with explicit target existence for a no-write plan. */
export async function existingTargetsForPlan(
  libraryRoot: string,
  agentSlug: string,
  targetRoot: string,
  skillNames: string[],
): Promise<Record<string, ExistingTarget>> {
  const status = await getMaterializationStatus(libraryRoot);
  const managed = status.byAgent[agentSlug] ?? {};
  const existing: Record<string, ExistingTarget> = {};
  for (const skill of skillNames) {
    if (managed[skill]) {
      existing[skill] = managed[skill];
      continue;
    }
    existing[skill] =
      (await pathKind(path.join(targetRoot, skill))) === "missing" ? { state: "absent" } : { state: "unmanaged" };
  }
  return existing;
}
