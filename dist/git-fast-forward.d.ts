import { type WorkspaceGitPort } from "./git-workspace.js";
export interface GitFastForwardPlan {
    kind: "git-fast-forward";
    schemaVersion: 1;
    planId: string;
    workspace: string;
    branch: string;
    baseHead: string;
    remoteHead: string;
    files: string[];
}
/**
 * Fetches remote-tracking metadata and describes a clean fast-forward without
 * changing the checked-out files. Credentials remain delegated to Git.
 */
export declare function planGitFastForward(root: string, git?: WorkspaceGitPort): Promise<GitFastForwardPlan>;
/** Runs a callback against an ephemeral checkout of the exact reviewed remote commit. */
export declare function inspectGitFastForwardPlan<T>(plan: GitFastForwardPlan, inspect: (checkout: string) => T | Promise<T>, git?: WorkspaceGitPort): Promise<T>;
/** Applies only the exact fast-forward that was previously reviewed. */
export declare function applyGitFastForwardPlan(plan: GitFastForwardPlan, git?: WorkspaceGitPort): Promise<string>;
//# sourceMappingURL=git-fast-forward.d.ts.map