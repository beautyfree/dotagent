import type { ImportOperation, ImportPlan } from "./import.js";
export declare const IMPORT_JOURNAL_VERSION: 1;
export interface ApplyImportOptions {
    /** Test/UI hook. Throwing simulates an interrupted operation. */
    beforeOperation?: (operation: ImportOperation, index: number) => void | Promise<void>;
}
export interface ApplyImportResult {
    planId: string;
    copied: number;
    dependenciesRecorded: number;
    unchanged: number;
    requiresResolve: boolean;
}
export interface ImportRecoveryPreview {
    kind: "import-recovery";
    schemaVersion: 1;
    library: string;
    journalPlanId: string;
    action: "complete" | "roll-back";
    operations: number;
    applied: number;
}
/** Builds a no-write, value-redacted summary of an interrupted import. */
export declare function inspectImportRecovery(libraryRoot: string): Promise<ImportRecoveryPreview | null>;
/** Recovers only content still byte-identical to the interrupted reviewed plan. */
export declare function recoverImport(libraryRoot: string): Promise<"none" | "completed" | "rolled-back">;
export declare function applyImportPlan(plan: ImportPlan, options?: ApplyImportOptions): Promise<ApplyImportResult>;
//# sourceMappingURL=import-apply.d.ts.map