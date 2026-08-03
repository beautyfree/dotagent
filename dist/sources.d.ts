import { type DependencyReference, type LibraryLock, type LibraryManifest, type ResolvedPackage } from "./schema.js";
export type ResolutionChange = {
    dependency: string;
    action: "added" | "updated" | "unchanged" | "removed";
    fromCommit: string | null;
    toCommit: string | null;
};
export interface ResolutionPlan {
    kind: "resolve-dependencies";
    schemaVersion: 1;
    planId: string;
    manifestHash: string;
    lock: LibraryLock;
    changes: ResolutionChange[];
}
export interface DependencyResolver {
    /** Resolve and audit in isolation. Implementations must not write to agent targets. */
    resolve(name: string, dependency: DependencyReference): Promise<ResolvedPackage>;
}
/** Canonical comparison identity; credentials and transport-specific Git spelling are removed. */
export declare function normalizeGitIdentity(input: string): string;
/** Dependencies resolve concurrently, then become a deterministically ordered immutable plan. */
export declare function planResolveDependencies(manifest: LibraryManifest, resolver: DependencyResolver, currentLock?: LibraryLock | null, generatedBy?: string): Promise<ResolutionPlan>;
/** Atomically writes only a still-valid reviewed resolution plan. */
export declare function applyResolutionPlan(root: string, plan: ResolutionPlan): Promise<void>;
//# sourceMappingURL=sources.d.ts.map