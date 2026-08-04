import type { SourceSecurityPolicy } from "./source-policy.js";
export { normalizeGitIdentity } from "./git-identity.js";
import { type DependencyReference, type LibraryLock, type LibraryManifest, type ResolvedPackage } from "./schema.js";
export type ResolutionChange = {
    dependency: string;
    action: "added" | "updated" | "unchanged" | "removed";
    fromSource: string | null;
    toSource: string | null;
    fromCommit: string | null;
    toCommit: string | null;
    fromCommittedAt: string | null;
    toCommittedAt: string | null;
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
    sourcePolicy: SourceSecurityPolicy | null;
}
export interface LibraryResolutionPlan {
    kind: "resolve-library-dependencies";
    schemaVersion: 1;
    planId: string;
    library: string;
    manifestHash: string;
    lock: LibraryLock;
    changes: ResolutionChange[];
    sourcePolicy: SourceSecurityPolicy | null;
}
export interface DependencyResolver {
    /** Serializable device policy included in the reviewed plan when available. */
    readonly sourcePolicy?: SourceSecurityPolicy | null;
    /** Resolve and audit in isolation. Implementations must not write to agent targets. */
    resolve(name: string, dependency: DependencyReference): Promise<ResolvedPackage>;
}
/** Compare two validated locks without resolving or fetching any dependency. */
export declare function diffLibraryLocks(currentLock: LibraryLock | null, nextLock: LibraryLock): ResolutionChange[];
/** Dependencies resolve concurrently, then become a deterministically ordered immutable plan. */
export declare function planResolveDependencies(manifest: LibraryManifest, resolver: DependencyResolver, currentLock?: LibraryLock | null, generatedBy?: string): Promise<ResolutionPlan>;
/** Binds a dependency-resolution preview to one local library for serialized CLI apply. */
export declare function planLibraryResolution(root: string, resolver: DependencyResolver, generatedBy?: string): Promise<LibraryResolutionPlan>;
/** Atomically writes only a still-valid reviewed resolution plan. */
export declare function applyResolutionPlan(root: string, plan: ResolutionPlan): Promise<void>;
export declare function applyLibraryResolutionPlan(plan: LibraryResolutionPlan): Promise<void>;
//# sourceMappingURL=sources.d.ts.map