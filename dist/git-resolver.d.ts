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
    limits?: ScanLimits;
}
export declare class GitDependencyResolver implements DependencyResolver {
    #private;
    constructor(options?: GitDependencyResolverOptions);
    resolve(_name: string, dependency: DependencyReference): Promise<ResolvedPackage>;
}
//# sourceMappingURL=git-resolver.d.ts.map