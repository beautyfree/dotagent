import { type SecretFinding } from "./audit.js";
import type { ResourceKind } from "./resource-model.js";
export declare const RESOURCE_PROJECTION_STATE_VERSION: 1;
export declare const RESOURCE_PROJECTION_JOURNAL_VERSION: 1;
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
export type ResourceProjectionTargetSnapshot = {
    state: "absent";
} | {
    state: "file";
    sha256: string;
} | {
    state: "symlink";
} | {
    state: "directory";
} | {
    state: "unsupported";
};
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
    expectedTargetRoot: {
        state: "absent";
    } | {
        state: "directory";
        realPath: string;
    };
    acceptedLossyResources: string[];
    operations: ManagedResourceProjectionOperation[];
    hasConflicts: boolean;
}
export interface ApplyManagedResourceProjectionOptions {
    /** Test/UI seam. Throwing rolls back already-applied operations. */
    beforeOperation?: (operation: ManagedResourceProjectionOperation, index: number) => void | Promise<void>;
}
export interface ApplyManagedResourceProjectionResult {
    planId: string;
    applied: number;
    unchanged: number;
}
export declare function resourceProjectionStatePath(library: string): string;
export declare function resourceProjectionJournalPath(library: string): string;
export declare function readResourceProjectionState(library: string): Promise<ResourceProjectionState>;
/**
 * Builds an exact no-write delivery plan. Existing files are writable only
 * when the local ownership ledger proves dotagents created the same target.
 */
export declare function planManagedResourceProjection(input: PlanManagedResourceProjectionInput): Promise<ManagedResourceProjectionPlan>;
export declare function recoverManagedResourceProjection(library: string): Promise<boolean>;
/** Applies only exact reviewed files; sibling and unmanaged native files are never traversed or replaced. */
export declare function applyManagedResourceProjection(plan: ManagedResourceProjectionPlan, options?: ApplyManagedResourceProjectionOptions): Promise<ApplyManagedResourceProjectionResult>;
//# sourceMappingURL=resource-apply.d.ts.map