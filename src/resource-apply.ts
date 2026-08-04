import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { scanTextForSecrets, type SecretFinding } from "./audit.js";
import { normalizePortablePath } from "./paths.js";
import { computePlanId } from "./plan.js";
import type { ResourceKind } from "./resource-model.js";

export const RESOURCE_PROJECTION_STATE_VERSION = 1 as const;
export const RESOURCE_PROJECTION_JOURNAL_VERSION = 1 as const;

export type ResourceFileSupport = "native" | "lossy" | "unsupported";

export interface ResourceFileProjectionInput {
  resource: `${ResourceKind}:${string}`;
  kind: ResourceKind;
  sourcePath: string;
  targetPath: string;
  support: ResourceFileSupport;
  adapter: string;
  loss?: string;
}

export interface PlanManagedResourceProjectionInput {
  library: string;
  agent: string;
  targetRoot: string;
  resources: ResourceFileProjectionInput[];
  acceptedLossyResources?: string[];
}

export type ResourceProjectionTargetSnapshot =
  | { state: "absent" }
  | { state: "file"; sha256: string }
  | { state: "symlink" }
  | { state: "directory" }
  | { state: "unsupported" };

export interface ManagedResourceTarget {
  agent: string;
  resource: string;
  kind: ResourceKind;
  adapter: string;
  sourcePath: string;
  sourceIntegrity: string;
  outputIntegrity: string;
}

export interface ResourceProjectionState {
  schemaVersion: typeof RESOURCE_PROJECTION_STATE_VERSION;
  targets: Record<string, ManagedResourceTarget>;
}

export type ResourceProjectionAction = "create" | "update" | "unchanged" | "conflict";

export interface ManagedResourceProjectionOperation {
  resource: string;
  kind: ResourceKind;
  adapter: string;
  support: ResourceFileSupport;
  loss?: string;
  sourcePath: string;
  source: string;
  sourceIntegrity: string;
  targetPath: string;
  target: string;
  expectedTarget: ResourceProjectionTargetSnapshot;
  expectedOwnership: ManagedResourceTarget | null;
  secretFindings: SecretFinding[];
  action: ResourceProjectionAction;
  reason?: string;
}

export interface ManagedResourceProjectionPlan {
  kind: "managed-resource-projection";
  schemaVersion: 1;
  planId: string;
  library: string;
  expectedLibraryRealPath: string;
  agent: string;
  targetRoot: string;
  expectedTargetRoot: { state: "absent" } | { state: "directory"; realPath: string };
  acceptedLossyResources: string[];
  operations: ManagedResourceProjectionOperation[];
  hasConflicts: boolean;
}

type ResourceProjectionJournal = {
  kind: "managed-resource-projection";
  schemaVersion: typeof RESOURCE_PROJECTION_JOURNAL_VERSION;
  planId: string;
  library: string;
  phase: "applying" | "rolling-back";
  previousState: ResourceProjectionState;
  operations: {
    operation: ManagedResourceProjectionOperation;
    status: "pending" | "staging" | "committing" | "applied";
  }[];
};

export interface ApplyManagedResourceProjectionOptions {
  /** Test/UI seam. Throwing rolls back already-applied operations. */
  beforeOperation?: (operation: ManagedResourceProjectionOperation, index: number) => void | Promise<void>;
}

export interface ApplyManagedResourceProjectionResult {
  planId: string;
  applied: number;
  unchanged: number;
}

function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function portableFilePath(value: string): string {
  const normalized = normalizePortablePath(value);
  if (!normalized || normalized !== value || value.includes("\\")) {
    throw new Error(`Resource projection path is not portable: ${value}`);
  }
  return normalized;
}

function assertNotBroadRoot(root: string, label: string): void {
  if (root === path.parse(root).root) throw new Error(`Refusing broad ${label}: ${root}`);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function directorySnapshot(
  root: string,
): Promise<{ state: "absent" } | { state: "directory"; realPath: string }> {
  try {
    const metadata = await lstat(root);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(`Resource projection root must be a regular directory: ${root}`);
    }
    return { state: "directory", realPath: await realpath(root) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: "absent" };
    throw error;
  }
}

async function targetSnapshot(target: string): Promise<ResourceProjectionTargetSnapshot> {
  try {
    const metadata = await lstat(target);
    if (metadata.isSymbolicLink()) return { state: "symlink" };
    if (metadata.isDirectory()) return { state: "directory" };
    if (!metadata.isFile()) return { state: "unsupported" };
    return { state: "file", sha256: sha256(await readFile(target)) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: "absent" };
    throw error;
  }
}

function metadataRoot(library: string): string {
  return path.join(library, ".dotagents");
}

export function resourceProjectionStatePath(library: string): string {
  return path.join(metadataRoot(path.resolve(library)), "resource-projection-state.json");
}

export function resourceProjectionJournalPath(library: string): string {
  return path.join(metadataRoot(path.resolve(library)), "resource-projection-journal.json");
}

async function writeAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, filePath);
}

export async function readResourceProjectionState(library: string): Promise<ResourceProjectionState> {
  try {
    const parsed = JSON.parse(
      await readFile(resourceProjectionStatePath(library), "utf8"),
    ) as Partial<ResourceProjectionState>;
    if (
      parsed.schemaVersion !== RESOURCE_PROJECTION_STATE_VERSION ||
      !parsed.targets ||
      typeof parsed.targets !== "object" ||
      Array.isArray(parsed.targets)
    ) {
      throw new Error("Unsupported resource projection state");
    }
    return parsed as ResourceProjectionState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { schemaVersion: RESOURCE_PROJECTION_STATE_VERSION, targets: {} };
    }
    throw error;
  }
}

function sameOwnership(left: ManagedResourceTarget | undefined, right: ManagedResourceTarget | null): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right);
}

async function assertNoLinkedParents(root: string, relativePath: string): Promise<void> {
  let current = root;
  for (const segment of relativePath.split("/").slice(0, -1)) {
    current = path.join(current, segment);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new Error(`Resource projection parent must be a regular directory: ${current}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

function assertDistinctTargets(resources: ResourceFileProjectionInput[]): void {
  const targets = resources.map((resource) => portableFilePath(resource.targetPath)).sort();
  for (const [index, target] of targets.entries()) {
    for (const previous of targets.slice(0, index)) {
      if (previous === target || target.startsWith(`${previous}/`)) {
        throw new Error(`Resource projection targets overlap: ${previous} and ${target}`);
      }
    }
  }
}

/**
 * Builds an exact no-write delivery plan. Existing files are writable only
 * when the local ownership ledger proves dotagents created the same target.
 */
export async function planManagedResourceProjection(
  input: PlanManagedResourceProjectionInput,
): Promise<ManagedResourceProjectionPlan> {
  const library = path.resolve(input.library);
  const targetRoot = path.resolve(input.targetRoot);
  assertNotBroadRoot(library, "resource library root");
  assertNotBroadRoot(targetRoot, "resource target root");
  const librarySnapshot = await directorySnapshot(library);
  if (librarySnapshot.state !== "directory") throw new Error(`Resource library does not exist: ${library}`);
  const expectedTargetRoot = await directorySnapshot(targetRoot);
  const state = await readResourceProjectionState(library);
  const acceptedLossyResources = [...new Set(input.acceptedLossyResources ?? [])].sort();
  const accepted = new Set(acceptedLossyResources);
  assertDistinctTargets(input.resources);
  const operations: ManagedResourceProjectionOperation[] = [];
  for (const resource of [...input.resources].sort((left, right) =>
    left.targetPath.localeCompare(right.targetPath, "en"),
  )) {
    const sourcePath = portableFilePath(resource.sourcePath);
    const targetPath = portableFilePath(resource.targetPath);
    if (resource.kind === "skill") {
      throw new Error("Skill directories must use the ownership-aware materialization engine");
    }
    const source = path.join(library, ...sourcePath.split("/"));
    const sourceMetadata = await lstat(source);
    if (sourceMetadata.isSymbolicLink() || !sourceMetadata.isFile()) {
      throw new Error(`Projected resource source must be a regular file: ${sourcePath}`);
    }
    await assertNoLinkedParents(library, sourcePath);
    const sourceContent = await readFile(source);
    if (sourceContent.byteLength > 1024 * 1024) {
      throw new Error(`Projected resource source exceeds the file size limit: ${sourcePath}`);
    }
    const sourceIntegrity = sha256(sourceContent);
    const secretFindings = scanTextForSecrets(sourceContent.toString("utf8"));
    const target = path.join(targetRoot, ...targetPath.split("/"));
    await assertNoLinkedParents(targetRoot, targetPath);
    const expectedTarget = await targetSnapshot(target);
    const expectedOwnership = state.targets[path.resolve(target)] ?? null;
    let action: ResourceProjectionAction;
    let reason: string | undefined;
    if (resource.support === "unsupported") {
      action = "conflict";
      reason = "The selected agent does not support this resource kind";
    } else if (resource.support === "lossy" && !accepted.has(resource.resource)) {
      action = "conflict";
      reason = resource.loss
        ? `Lossy projection requires explicit review: ${resource.loss}`
        : "Lossy projection requires explicit review";
    } else if (secretFindings.length > 0) {
      action = "conflict";
      reason = "Resource contains possible secrets and requires remediation before projection";
    } else if (expectedTarget.state === "absent") {
      if (expectedOwnership) {
        action = "conflict";
        reason = "A previously managed target is missing; deletion is never repaired implicitly";
      } else {
        action = "create";
      }
    } else if (expectedTarget.state !== "file") {
      action = "conflict";
      reason = `Target is an unmanaged ${expectedTarget.state}`;
    } else if (!expectedOwnership) {
      action = "conflict";
      reason = "Target contains unmanaged content";
    } else if (
      expectedOwnership.agent !== input.agent ||
      expectedOwnership.resource !== resource.resource ||
      expectedOwnership.adapter !== resource.adapter ||
      expectedOwnership.sourcePath !== sourcePath
    ) {
      action = "conflict";
      reason = "Target is owned by a different resource projection";
    } else if (expectedTarget.sha256 !== expectedOwnership.outputIntegrity) {
      action = "conflict";
      reason = "Managed target has local changes";
    } else {
      action = expectedTarget.sha256 === sourceIntegrity ? "unchanged" : "update";
    }
    operations.push({
      resource: resource.resource,
      kind: resource.kind,
      adapter: resource.adapter,
      support: resource.support,
      ...(resource.loss ? { loss: resource.loss } : {}),
      sourcePath,
      source,
      sourceIntegrity,
      targetPath,
      target,
      expectedTarget,
      expectedOwnership,
      secretFindings,
      action,
      ...(reason ? { reason } : {}),
    });
  }
  const payload = {
    kind: "managed-resource-projection" as const,
    schemaVersion: 1 as const,
    library,
    expectedLibraryRealPath: librarySnapshot.realPath,
    agent: input.agent,
    targetRoot,
    expectedTargetRoot,
    acceptedLossyResources,
    operations,
    hasConflicts: operations.some((operation) => operation.action === "conflict"),
  };
  return { ...payload, planId: computePlanId(payload) };
}

function stagePath(operation: ManagedResourceProjectionOperation, planId: string): string {
  return `${operation.target}.dotagents-stage-${planId}`;
}

function backupPath(operation: ManagedResourceProjectionOperation, planId: string): string {
  return `${operation.target}.dotagents-backup-${planId}`;
}

async function assertPlanPreconditions(
  plan: ManagedResourceProjectionPlan,
  state: ResourceProjectionState,
): Promise<void> {
  if ((await realpath(plan.library)) !== plan.expectedLibraryRealPath) {
    throw new Error("Resource library changed after review");
  }
  if (JSON.stringify(await directorySnapshot(plan.targetRoot)) !== JSON.stringify(plan.expectedTargetRoot)) {
    throw new Error("Resource projection root changed after review");
  }
  for (const operation of plan.operations.filter((entry) => entry.action === "create" || entry.action === "update")) {
    await assertNoLinkedParents(plan.library, operation.sourcePath);
    await assertNoLinkedParents(plan.targetRoot, operation.targetPath);
    const sourceMetadata = await lstat(operation.source);
    if (sourceMetadata.isSymbolicLink() || !sourceMetadata.isFile()) {
      throw new Error(`Resource source changed after review: ${operation.resource}`);
    }
    if (sha256(await readFile(operation.source)) !== operation.sourceIntegrity) {
      throw new Error(`Resource source changed after review: ${operation.resource}`);
    }
    if (JSON.stringify(await targetSnapshot(operation.target)) !== JSON.stringify(operation.expectedTarget)) {
      throw new Error(`Resource target changed after review: ${operation.targetPath}`);
    }
    if (!sameOwnership(state.targets[path.resolve(operation.target)], operation.expectedOwnership)) {
      throw new Error(`Resource ownership changed after review: ${operation.targetPath}`);
    }
  }
}

async function rollbackResourceProjection(journal: ResourceProjectionJournal): Promise<void> {
  journal.phase = "rolling-back";
  await writeAtomic(resourceProjectionJournalPath(journal.library), journal);
  for (const entry of [...journal.operations].reverse()) {
    const operation = entry.operation;
    const stage = stagePath(operation, journal.planId);
    const backup = backupPath(operation, journal.planId);
    await rm(stage, { force: true });
    if (entry.status === "committing" || entry.status === "applied") {
      const current = await targetSnapshot(operation.target);
      if (current.state === "file" && current.sha256 === operation.sourceIntegrity) {
        await rm(operation.target, { force: true });
      }
      if ((await exists(backup)) && !(await exists(operation.target))) await rename(backup, operation.target);
    }
  }
  await writeAtomic(resourceProjectionStatePath(journal.library), journal.previousState);
  await rm(resourceProjectionJournalPath(journal.library), { force: true });
}

export async function recoverManagedResourceProjection(library: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(
      await readFile(resourceProjectionJournalPath(library), "utf8"),
    ) as ResourceProjectionJournal;
    if (
      parsed.kind !== "managed-resource-projection" ||
      parsed.schemaVersion !== RESOURCE_PROJECTION_JOURNAL_VERSION ||
      !Array.isArray(parsed.operations)
    ) {
      throw new Error("Unsupported resource projection journal");
    }
    await rollbackResourceProjection(parsed);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Applies only exact reviewed files; sibling and unmanaged native files are never traversed or replaced. */
export async function applyManagedResourceProjection(
  plan: ManagedResourceProjectionPlan,
  options: ApplyManagedResourceProjectionOptions = {},
): Promise<ApplyManagedResourceProjectionResult> {
  const { planId, ...payload } = plan;
  if (computePlanId(payload) !== planId) throw new Error("Resource projection plan is stale or modified");
  if (plan.hasConflicts || plan.operations.some((operation) => operation.action === "conflict")) {
    throw new Error("Resource projection plan contains conflicts");
  }
  if (await exists(resourceProjectionJournalPath(plan.library))) {
    throw new Error("An unfinished resource projection requires recovery first");
  }
  const state = await readResourceProjectionState(plan.library);
  await assertPlanPreconditions(plan, state);
  const mutations = plan.operations.filter(
    (operation) => operation.action === "create" || operation.action === "update",
  );
  const journal: ResourceProjectionJournal = {
    kind: "managed-resource-projection",
    schemaVersion: RESOURCE_PROJECTION_JOURNAL_VERSION,
    planId,
    library: plan.library,
    phase: "applying",
    previousState: structuredClone(state),
    operations: mutations.map((operation) => ({ operation, status: "pending" })),
  };
  await writeAtomic(resourceProjectionJournalPath(plan.library), journal);
  try {
    for (const [index, entry] of journal.operations.entries()) {
      const operation = entry.operation;
      await options.beforeOperation?.(operation, index);
      await mkdir(path.dirname(operation.target), { recursive: true });
      const stage = stagePath(operation, planId);
      await rm(stage, { force: true });
      entry.status = "staging";
      await writeAtomic(resourceProjectionJournalPath(plan.library), journal);
      await writeFile(stage, await readFile(operation.source), { flag: "wx" });
      entry.status = "committing";
      await writeAtomic(resourceProjectionJournalPath(plan.library), journal);
      if (operation.action === "update") await rename(operation.target, backupPath(operation, planId));
      await rename(stage, operation.target);
      entry.status = "applied";
      await writeAtomic(resourceProjectionJournalPath(plan.library), journal);
      state.targets[path.resolve(operation.target)] = {
        agent: plan.agent,
        resource: operation.resource,
        kind: operation.kind,
        adapter: operation.adapter,
        sourcePath: operation.sourcePath,
        sourceIntegrity: operation.sourceIntegrity,
        outputIntegrity: operation.sourceIntegrity,
      };
    }
    await writeAtomic(resourceProjectionStatePath(plan.library), state);
    for (const entry of journal.operations) {
      await rm(stagePath(entry.operation, planId), { force: true });
      await rm(backupPath(entry.operation, planId), { force: true });
    }
    await rm(resourceProjectionJournalPath(plan.library), { force: true });
    return {
      planId,
      applied: mutations.length,
      unchanged: plan.operations.length - mutations.length,
    };
  } catch (error) {
    await rollbackResourceProjection(journal);
    throw error;
  }
}
