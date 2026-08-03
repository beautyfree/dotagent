import type { MaterializationOperation, MaterializationPlan } from "./materialize.js";
export declare const MATERIALIZATION_STATE_VERSION: 1;
export declare const MATERIALIZATION_JOURNAL_VERSION: 1;
export interface ManagedTargetState {
    agent: string;
    skill: string;
    mode: "symlink" | "junction" | "copy";
    source: string;
    sourceIntegrity: string;
}
export interface MaterializationState {
    schemaVersion: typeof MATERIALIZATION_STATE_VERSION;
    targets: Record<string, ManagedTargetState>;
}
export interface ApplyMaterializationOptions {
    /** Test/UI hook; throwing simulates an interrupted operation and triggers rollback. */
    beforeOperation?: (operation: MaterializationOperation, index: number) => void | Promise<void>;
}
export interface ApplyMaterializationResult {
    planId: string;
    applied: number;
    unchanged: number;
}
export interface MaterializationRecoveryPreview {
    kind: "materialization-recovery";
    schemaVersion: 1;
    library: string;
    journalPlanId: string;
    action: "roll-back";
    operations: number;
    applied: number;
}
export declare function readMaterializationState(libraryRoot: string): Promise<MaterializationState>;
export declare function recoverMaterialization(libraryRoot: string): Promise<boolean>;
/** Builds a no-write summary before an interrupted materialization is rolled back. */
export declare function inspectMaterializationRecovery(libraryRoot: string): Promise<MaterializationRecoveryPreview | null>;
export declare function applyMaterializationPlan(plan: MaterializationPlan, options?: ApplyMaterializationOptions): Promise<ApplyMaterializationResult>;
//# sourceMappingURL=materialize-apply.d.ts.map