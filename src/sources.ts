import { rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeGitIdentity } from "./git-identity.js";
import { loadLibrary } from "./library.js";
import { computePlanId } from "./plan.js";

export { normalizeGitIdentity } from "./git-identity.js";

import {
  type DependencyReference,
  type LibraryLock,
  type LibraryManifest,
  libraryLockSchema,
  type ResolvedPackage,
} from "./schema.js";

export type ResolutionChange = {
  dependency: string;
  action: "added" | "updated" | "unchanged" | "removed";
  fromSource: string | null;
  toSource: string | null;
  fromCommit: string | null;
  toCommit: string | null;
  fromIntegrity: string | null;
  toIntegrity: string | null;
  fromLicense: string | null;
  toLicense: string | null;
  skillsAdded: string[];
  skillsRemoved: string[];
};

export interface ResolutionPlan {
  kind: "resolve-dependencies";
  schemaVersion: 1;
  planId: string;
  manifestHash: string;
  lock: LibraryLock;
  changes: ResolutionChange[];
}

export interface LibraryResolutionPlan {
  kind: "resolve-library-dependencies";
  schemaVersion: 1;
  planId: string;
  library: string;
  manifestHash: string;
  lock: LibraryLock;
  changes: ResolutionChange[];
}

export interface DependencyResolver {
  /** Resolve and audit in isolation. Implementations must not write to agent targets. */
  resolve(name: string, dependency: DependencyReference): Promise<ResolvedPackage>;
}

/** Compare two validated locks without resolving or fetching any dependency. */
export function diffLibraryLocks(currentLock: LibraryLock | null, nextLock: LibraryLock): ResolutionChange[] {
  const changes: ResolutionChange[] = [];
  for (const [name, entry] of Object.entries(nextLock.resolved).sort(([left], [right]) =>
    left.localeCompare(right, "en"),
  )) {
    const previous = currentLock?.resolved[name];
    const previousSkills = new Set(previous?.skills.map((skill) => skill.name) ?? []);
    const nextSkills = new Set(entry.skills.map((skill) => skill.name));
    changes.push({
      dependency: name,
      action: !previous
        ? "added"
        : previous.commit === entry.commit && previous.integrity === entry.integrity
          ? "unchanged"
          : "updated",
      fromSource: previous ? normalizeGitIdentity(previous.url) : null,
      toSource: normalizeGitIdentity(entry.url),
      fromCommit: previous?.commit ?? null,
      toCommit: entry.commit,
      fromIntegrity: previous?.integrity ?? null,
      toIntegrity: entry.integrity,
      fromLicense: previous?.license ?? null,
      toLicense: entry.license ?? null,
      skillsAdded: [...nextSkills].filter((skill) => !previousSkills.has(skill)).sort(),
      skillsRemoved: [...previousSkills].filter((skill) => !nextSkills.has(skill)).sort(),
    });
  }
  for (const [name, previous] of Object.entries(currentLock?.resolved ?? {}).sort(([left], [right]) =>
    left.localeCompare(right, "en"),
  )) {
    if (!(name in nextLock.resolved))
      changes.push({
        dependency: name,
        action: "removed",
        fromSource: normalizeGitIdentity(previous.url),
        toSource: null,
        fromCommit: previous.commit,
        toCommit: null,
        fromIntegrity: previous.integrity,
        toIntegrity: null,
        fromLicense: previous.license ?? null,
        toLicense: null,
        skillsAdded: [],
        skillsRemoved: previous.skills.map((skill) => skill.name).sort(),
      });
  }
  return changes;
}

function resolvedSkillNames(manifest: LibraryManifest, entries: [string, ResolvedPackage][]): void {
  const names = new Map<string, string>();
  for (const owned of manifest.skills)
    names.set(path.posix.basename(owned).toLocaleLowerCase("en-US"), "owned library");
  for (const [dependency, resolved] of entries) {
    for (const skill of resolved.skills) {
      const folded = skill.name.toLocaleLowerCase("en-US");
      const previous = names.get(folded);
      if (previous)
        throw new Error(`Skill name collision: ${skill.name} is exported by ${previous} and dependency ${dependency}`);
      names.set(folded, `dependency ${dependency}`);
    }
  }
}

/** Dependencies resolve concurrently, then become a deterministically ordered immutable plan. */
export async function planResolveDependencies(
  manifest: LibraryManifest,
  resolver: DependencyResolver,
  currentLock: LibraryLock | null = null,
  generatedBy = "@beautyfree/dotagent@0.0.0",
): Promise<ResolutionPlan> {
  const dependencies = Object.entries(manifest.dependencies).sort(([left], [right]) => left.localeCompare(right, "en"));
  const resolved = await Promise.all(
    dependencies.map(async ([name, dependency]) => {
      const result = await resolver.resolve(name, dependency);
      if (normalizeGitIdentity(result.url) !== normalizeGitIdentity(dependency.url))
        throw new Error(`Resolver returned a different source for ${name}`);
      if (result.requested_ref !== dependency.ref)
        throw new Error(`Resolver returned a different requested ref for ${name}`);
      return [name, result] as [string, ResolvedPackage];
    }),
  );
  resolvedSkillNames(manifest, resolved);
  const lock = libraryLockSchema.parse({
    lockfile_version: 1,
    generated_by: generatedBy,
    resolved: Object.fromEntries(resolved),
  });
  const changes = diffLibraryLocks(currentLock, lock);
  const payload = {
    kind: "resolve-dependencies" as const,
    schemaVersion: 1 as const,
    manifestHash: computePlanId(manifest),
    lock,
    changes,
  };
  return { ...payload, planId: computePlanId(payload) };
}

/** Binds a dependency-resolution preview to one local library for serialized CLI apply. */
export async function planLibraryResolution(
  root: string,
  resolver: DependencyResolver,
  generatedBy = "@beautyfree/dotagent@0.0.0",
): Promise<LibraryResolutionPlan> {
  const library = path.resolve(root);
  const loaded = await loadLibrary(library);
  if (!loaded.ok) throw new Error(loaded.issues.map((issue) => issue.message).join("; "));
  const resolved = await planResolveDependencies(loaded.value.manifest, resolver, loaded.value.lock, generatedBy);
  const payload = {
    kind: "resolve-library-dependencies" as const,
    schemaVersion: 1 as const,
    library,
    manifestHash: resolved.manifestHash,
    lock: resolved.lock,
    changes: resolved.changes,
  };
  return { ...payload, planId: computePlanId(payload) };
}

async function writeReviewedResolution(
  root: string,
  plan: Pick<ResolutionPlan, "manifestHash" | "lock">,
): Promise<void> {
  const loaded = await loadLibrary(root);
  if (!loaded.ok) throw new Error(loaded.issues.map((issue) => issue.message).join("; "));
  if (computePlanId(loaded.value.manifest) !== plan.manifestHash)
    throw new Error("skills.json changed after this resolution plan was reviewed");
  const destination = path.join(root, "skills.lock");
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(plan.lock, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, destination);
}

/** Atomically writes only a still-valid reviewed resolution plan. */
export async function applyResolutionPlan(root: string, plan: ResolutionPlan): Promise<void> {
  const { planId, ...payload } = plan;
  if (computePlanId(payload) !== planId) throw new Error("Resolution plan is stale or modified");
  await writeReviewedResolution(path.resolve(root), plan);
}

export async function applyLibraryResolutionPlan(plan: LibraryResolutionPlan): Promise<void> {
  const { planId, ...payload } = plan;
  if (computePlanId(payload) !== planId) throw new Error("Library resolution plan is stale or modified");
  await writeReviewedResolution(plan.library, plan);
}
