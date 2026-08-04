import { existsSync, lstatSync, readFileSync } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { scanOwnedSkill } from "./inventory.js";
import { applyLibraryUpdatePlan, planLibraryUpdate } from "./library-update.js";
import { computePlanId } from "./plan.js";
import { normalizeGitIdentity } from "./git-identity.js";
import { resourceManifestSchema, scanResourceManifest } from "./resource-model.js";
export const SCOPE_DESCRIPTOR_VERSION = 1;
export const SCOPE_DESCRIPTOR_FILE = "dotagents.scope.json";
const RESOURCE_MANIFEST_FILE = "resources.json";
const MAX_RESOURCE_MANIFEST_BYTES = 1024 * 1024;
export const portableScopeDescriptorSchema = z
    .object({
    schema_version: z.literal(SCOPE_DESCRIPTOR_VERSION),
    scope: z.enum(["personal", "project"]),
})
    .strict();
function stableUnique(values) {
    return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
}
function sortedOrigins(origins) {
    return [...origins].sort((left, right) => `${left.scope}\0${left.library}\0${left.kind}\0${left.path}`.localeCompare(`${right.scope}\0${right.library}\0${right.kind}\0${right.path}`, "en"));
}
async function collectScopeResources(input) {
    const { scope, library } = input;
    const resources = [];
    const issues = [];
    let declaredSkillPaths = new Set();
    const resourceManifestPath = path.join(library.root, RESOURCE_MANIFEST_FILE);
    if (existsSync(resourceManifestPath)) {
        try {
            const metadata = await lstat(resourceManifestPath);
            if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size > MAX_RESOURCE_MANIFEST_BYTES) {
                throw new Error("resources.json must be a bounded regular file");
            }
            const manifest = resourceManifestSchema.parse(JSON.parse(await readFile(resourceManifestPath, "utf8")));
            declaredSkillPaths = new Set(manifest.resources.filter((resource) => resource.kind === "skill").map((resource) => resource.path));
            const scanned = await scanResourceManifest(library.root, manifest);
            for (const resource of scanned.resources) {
                const key = `${resource.kind}:${resource.id}`;
                resources.push({
                    key,
                    kind: resource.kind,
                    id: resource.id,
                    fingerprint: `owned:${resource.kind}:${resource.integrity}`,
                    origin: {
                        scope,
                        library: library.manifest.name,
                        resourceKind: resource.kind,
                        kind: "owned",
                        path: resource.path,
                        integrity: resource.integrity,
                    },
                });
                if (resource.secretFindings.length > 0) {
                    issues.push({
                        code: "resource-secret",
                        scope,
                        library: library.manifest.name,
                        resourceKey: key,
                        message: `Resource ${key} contains possible secrets and cannot be composed safely`,
                    });
                }
            }
        }
        catch {
            issues.push({
                code: "invalid-resource-manifest",
                scope,
                library: library.manifest.name,
                resourceKey: RESOURCE_MANIFEST_FILE,
                message: `${RESOURCE_MANIFEST_FILE} could not be verified in ${library.manifest.name}`,
            });
        }
    }
    for (const relativePath of library.manifest.skills.filter((skillPath) => !declaredSkillPaths.has(skillPath))) {
        const scanned = await scanOwnedSkill(library.root, relativePath);
        if (!scanned.ok) {
            issues.push({
                code: "invalid-owned-skill",
                scope,
                library: library.manifest.name,
                resourceKey: `skill:${relativePath}`,
                message: `Owned skill ${relativePath} could not be verified in ${library.manifest.name}`,
            });
            continue;
        }
        resources.push({
            key: `skill:${scanned.value.name}`,
            kind: "skill",
            id: scanned.value.name,
            fingerprint: `owned:${scanned.value.integrity}`,
            origin: {
                scope,
                library: library.manifest.name,
                resourceKind: "skill",
                kind: "owned",
                path: scanned.value.path,
                integrity: scanned.value.integrity,
            },
        });
    }
    for (const [dependency, reference] of Object.entries(library.manifest.dependencies)) {
        if (!library.lock) {
            issues.push({
                code: "missing-lock",
                scope,
                library: library.manifest.name,
                resourceKey: `skill:${dependency}`,
                message: `Dependency ${dependency} has no immutable lock in ${library.manifest.name}`,
            });
            continue;
        }
        const locked = library.lock.resolved[dependency];
        if (!locked) {
            issues.push({
                code: "missing-lock-entry",
                scope,
                library: library.manifest.name,
                resourceKey: `skill:${dependency}`,
                message: `Dependency ${dependency} is missing from the immutable lock in ${library.manifest.name}`,
            });
            continue;
        }
        const repository = normalizeGitIdentity(reference.url);
        for (const skill of locked.skills) {
            resources.push({
                key: `skill:${skill.name}`,
                kind: "skill",
                id: skill.name,
                fingerprint: `dependency:${repository}:${locked.commit}:${locked.integrity}:${skill.path}`,
                origin: {
                    scope,
                    library: library.manifest.name,
                    resourceKind: "skill",
                    kind: "dependency",
                    dependency,
                    path: skill.path,
                    repository,
                    commit: locked.commit,
                    integrity: locked.integrity,
                },
            });
        }
    }
    return { resources, issues };
}
/**
 * Compose portable Personal and Project declarations under a Device overlay.
 * Equal immutable content is deduplicated; every unequal same-id resource is
 * an explicit blocker. No input root is serialized into the result or plan ID.
 */
export async function createScopeCompositionPlan(inputs, device = {}) {
    const byScope = new Map();
    for (const input of inputs) {
        if (byScope.has(input.scope))
            throw new Error(`Only one ${input.scope} library can be composed at a time`);
        byScope.set(input.scope, input);
    }
    const ordered = [...byScope.values()].sort((left, right) => left.scope.localeCompare(right.scope, "en"));
    const collected = await Promise.all(ordered.map(collectScopeResources));
    const issues = collected
        .flatMap((entry) => entry.issues)
        .sort((left, right) => `${left.resourceKey}\0${left.scope}`.localeCompare(`${right.resourceKey}\0${right.scope}`, "en"));
    const grouped = new Map();
    for (const candidate of collected.flatMap((entry) => entry.resources)) {
        const values = grouped.get(candidate.key) ?? [];
        values.push(candidate);
        grouped.set(candidate.key, values);
    }
    const exclusions = stableUnique(device.exclusions ?? []);
    const excluded = new Set(exclusions);
    const resources = [];
    const conflicts = [];
    for (const [key, candidates] of [...grouped].sort(([left], [right]) => left.localeCompare(right, "en"))) {
        const fingerprints = new Set(candidates.map((candidate) => candidate.fingerprint));
        const origins = sortedOrigins(candidates.map((candidate) => candidate.origin));
        if (fingerprints.size > 1) {
            conflicts.push({ code: "resource-conflict", resourceKey: key, origins });
            continue;
        }
        const first = candidates[0];
        if (!first)
            continue;
        resources.push({ key, kind: first.kind, id: first.id, origins, excludedByDevice: excluded.has(key) });
    }
    const scopes = ordered.map((entry) => ({ scope: entry.scope, library: entry.library.manifest.name }));
    const planData = {
        kind: "scope-composition",
        schemaVersion: 1,
        scopes,
        resources,
        conflicts,
        issues,
        device: { exclusions },
    };
    return {
        schemaVersion: 1,
        planId: computePlanId(planData),
        scopes,
        resources,
        conflicts,
        issues,
        device: { exclusions },
        hasBlockers: conflicts.length > 0 || issues.length > 0,
    };
}
/** Read one bounded portable descriptor without following a linked file. */
export function readPortableScopeDescriptor(root) {
    const file = path.join(path.resolve(root), SCOPE_DESCRIPTOR_FILE);
    if (!existsSync(file))
        return null;
    const metadata = lstatSync(file);
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size > 64 * 1024) {
        throw new Error(`${SCOPE_DESCRIPTOR_FILE} must be a bounded regular file`);
    }
    return portableScopeDescriptorSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}
async function scopeLibraryFingerprint(library, scope) {
    const composition = await createScopeCompositionPlan([{ scope, library }]);
    return computePlanId({
        kind: "scope-library",
        manifest: library.manifest,
        lock: library.lock,
        resources: composition.resources,
        conflicts: composition.conflicts,
        issues: composition.issues,
    });
}
/** Legacy scope migration is deliberately preview-only until apply is separately reviewed. */
export async function createLegacyScopeMigrationPlan(library, scope) {
    if (readPortableScopeDescriptor(library.root))
        throw new Error("This library already declares its portable scope");
    const descriptor = scope ? portableScopeDescriptorSchema.parse({ schema_version: 1, scope }) : null;
    const libraryFingerprint = scope
        ? await scopeLibraryFingerprint(library, scope)
        : computePlanId({ kind: "scope-library-undecided", manifest: library.manifest, lock: library.lock });
    const data = {
        kind: "legacy-scope-migration",
        schemaVersion: 1,
        library: library.manifest.name,
        libraryFingerprint,
        descriptor,
        relativePath: SCOPE_DESCRIPTOR_FILE,
        precondition: "descriptor-absent",
    };
    return {
        schemaVersion: 1,
        planId: computePlanId(data),
        status: descriptor ? "ready" : "requires-decision",
        library: library.manifest.name,
        libraryFingerprint: data.libraryFingerprint,
        descriptor,
        relativePath: SCOPE_DESCRIPTOR_FILE,
        precondition: "descriptor-absent",
    };
}
/** Apply only the unchanged, explicitly classified legacy scope plan. */
export async function applyLegacyScopeMigrationPlan(library, plan, expectedPlanId) {
    if (!plan.descriptor || plan.status !== "ready")
        throw new Error("Choose Personal or Project before migration");
    const refreshed = await createLegacyScopeMigrationPlan(library, plan.descriptor.scope);
    if (expectedPlanId !== plan.planId || refreshed.planId !== plan.planId) {
        throw new Error("Scope migration plan is stale or modified");
    }
    const content = `${JSON.stringify(plan.descriptor, null, 2)}\n`;
    const update = planLibraryUpdate({
        root: library.root,
        skills: [],
        portableFiles: { [SCOPE_DESCRIPTOR_FILE]: content },
    });
    return applyLibraryUpdatePlan(update, {
        portableFiles: { [SCOPE_DESCRIPTOR_FILE]: content },
        historyOperation: "scope-migration",
    });
}
//# sourceMappingURL=scope.js.map