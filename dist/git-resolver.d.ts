import { type ScanLimits } from "./inventory.js";
import type { DependencyReference, ResolvedPackage } from "./schema.js";
import { type DependencyResolver } from "./sources.js";
export interface GitRunner {
    run(args: string[], cwd?: string): Promise<string>;
}
export declare class NodeGitRunner implements GitRunner {
    run(args: string[], cwd?: string): Promise<string>;
}
export interface GitDependencyResolverOptions {
    git?: GitRunner;
    temporaryRoot?: string;
    /** Disposable local Git object cache. Never serialized into a portable manifest. */
    cacheRoot?: string;
    limits?: ScanLimits;
}
export interface PreparedDependencyPackage {
    dependency: string;
    root: string;
    commit: string;
    integrity: string;
    skills: ResolvedPackage["skills"];
}
export declare class GitDependencyResolver implements DependencyResolver {
    #private;
    constructor(options?: GitDependencyResolverOptions);
    resolve(_name: string, dependency: DependencyReference): Promise<ResolvedPackage>;
    /**
     * Materializes only an already locked immutable commit into a disposable
     * machine cache and re-verifies the complete package before returning it.
     */
    prepareLocked(name: string, dependency: DependencyReference, locked: ResolvedPackage, checkoutRoot: string): Promise<PreparedDependencyPackage>;
}
//# sourceMappingURL=git-resolver.d.ts.map