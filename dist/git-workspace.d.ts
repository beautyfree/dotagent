import { scanTextForSecrets } from "./audit.js";
export interface WorkspaceGitPort {
    run(args: string[], cwd: string, options?: {
        nonInteractive?: boolean;
        raw?: boolean;
    }): Promise<string>;
}
export declare class NodeWorkspaceGitPort implements WorkspaceGitPort {
    run(args: string[], cwd: string, options?: {
        nonInteractive?: boolean;
        raw?: boolean;
    }): Promise<string>;
}
export interface GitWorkspaceStatus {
    branch: string;
    changed: boolean;
    ahead: number;
    behind: number;
    remoteIdentity: string | null;
    head: string | null;
}
export type GitWorkspaceSecretFinding = {
    file: string;
    rule: ReturnType<typeof scanTextForSecrets>[number]["rule"];
    line: number;
    column: number;
};
export interface GitClonePlan {
    kind: "git-clone";
    schemaVersion: 1;
    planId: string;
    remote: string;
    remoteIdentity: string;
    destination: string;
}
export interface GitCommitPlan {
    kind: "git-commit";
    schemaVersion: 1;
    planId: string;
    library: string;
    visibility: "private" | "team" | "public";
    message: string;
    baseHead: string | null;
    files: {
        path: string;
        hash: string | null;
    }[];
    secretFindings: GitWorkspaceSecretFinding[];
    unsafePaths: string[];
    auditErrors: {
        code: string;
        message: string;
        remediation: string;
        field?: string;
    }[];
    hasBlockers: boolean;
}
export interface GitPullPlan {
    kind: "git-pull";
    schemaVersion: 1;
    planId: string;
    library: string;
    visibility: "private" | "team" | "public";
    branch: string;
    baseHead: string;
    remoteHead: string;
    files: string[];
    secretFindings: GitWorkspaceSecretFinding[];
    unsafePaths: string[];
    auditErrors: {
        code: string;
        message: string;
        remediation: string;
        field?: string;
    }[];
    hasBlockers: boolean;
}
export interface GitPushPlan {
    kind: "git-push";
    schemaVersion: 1;
    planId: string;
    library: string;
    branch: string;
    head: string;
    remoteIdentity: string;
    ahead: number;
}
export declare function initializeLibraryGit(root: string, remote?: string, git?: WorkspaceGitPort): Promise<void>;
export declare function setLibraryRemote(root: string, remote: string, git?: WorkspaceGitPort): Promise<void>;
export declare function cloneLibrary(remote: string, target: string, git?: WorkspaceGitPort): Promise<void>;
export declare function planLibraryClone(remote: string, target: string): Promise<GitClonePlan>;
export declare function applyLibraryClone(plan: GitClonePlan, git?: WorkspaceGitPort): Promise<void>;
export declare function getLibraryGitStatus(root: string, git?: WorkspaceGitPort): Promise<GitWorkspaceStatus>;
export declare function planLibraryCommit(root: string, message: string, visibility?: GitCommitPlan["visibility"], git?: WorkspaceGitPort): Promise<GitCommitPlan>;
export declare function applyLibraryCommit(plan: GitCommitPlan, git?: WorkspaceGitPort): Promise<string | null>;
export declare function fetchLibrary(root: string, git?: WorkspaceGitPort): Promise<void>;
export declare function planLibraryPull(root: string, visibility?: GitPullPlan["visibility"], git?: WorkspaceGitPort): Promise<GitPullPlan>;
export declare function applyLibraryPull(plan: GitPullPlan, git?: WorkspaceGitPort): Promise<string>;
export declare function planLibraryPush(root: string, git?: WorkspaceGitPort): Promise<GitPushPlan>;
export declare function applyLibraryPush(plan: GitPushPlan, git?: WorkspaceGitPort): Promise<void>;
//# sourceMappingURL=git-workspace.d.ts.map