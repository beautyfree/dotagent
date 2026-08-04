import { type ScanLimits } from "./inventory.js";
import type { DependencyReference, ResolvedPackage } from "./schema.js";
import { type SourceSecurityPolicy, type SourceSecurityPolicyInput } from "./source-policy.js";
import { type DependencyResolver } from "./sources.js";
export interface GitRunner {
    run(args: string[], cwd?: string): Promise<string>;
}
export declare class NodeGitRunner implements GitRunner {
    #private;
    constructor(timeoutMs?: number);
    run(args: string[], cwd?: string): Promise<string>;
}
export interface GitDependencyResolverOptions {
    git?: GitRunner;
    /** Hard upper bound for each Git subprocess; ignored when a custom runner is supplied. */
    gitTimeoutMs?: number;
    temporaryRoot?: string;
    /** Disposable local Git object cache. Never serialized into a portable manifest. */
    cacheRoot?: string;
    limits?: ScanLimits;
    /** Device-owned policy. Missing policy denies every remote and local source. */
    sourcePolicy?: SourceSecurityPolicyInput;
    /** Testable clock used only for the reviewed commit cooling-off policy. */
    now?: () => Date;
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
    readonly sourcePolicy: SourceSecurityPolicy;
    constructor(options?: GitDependencyResolverOptions);
    resolve(_name: string, dependency: DependencyReference): Promise<ResolvedPackage>;
    /**
     * Materializes only an already locked immutable commit into a disposable
     * machine cache and re-verifies the complete package before returning it.
     */
    prepareLocked(name: string, dependency: DependencyReference, locked: ResolvedPackage, checkoutRoot: string): Promise<PreparedDependencyPackage>;
}
//# sourceMappingURL=git-resolver.d.ts.map