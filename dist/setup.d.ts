import { type ApplyImportResult } from "./import-apply.js";
import { type ImportCandidate } from "./import.js";
import { type InitializeLibraryPlan } from "./init.js";
export interface SetupOptions {
    root?: string;
    name?: string;
    home?: string;
    platform?: NodeJS.Platform;
    environment?: NodeJS.ProcessEnv;
    remote?: string;
}
export interface SetupSummary {
    agentsDetected: number;
    skillsFound: number;
    owned: number;
    sourceLinked: number;
    needsReview: number;
    linkedAliases: number;
    skippedProvenance: number;
}
export interface SetupPlan {
    kind: "setup";
    schemaVersion: 1;
    planId: string;
    root: string;
    libraryName: string;
    remote: string | null;
    initialization: InitializeLibraryPlan | null;
    candidates: ImportCandidate[];
    summary: SetupSummary;
}
export interface ApplySetupResult {
    root: string;
    planId: string;
    createdLibrary: boolean;
    gitInitialized: boolean;
    import: ApplyImportResult;
}
/**
 * Creates a concise first-run review from read-only machine discovery. It does
 * not create a library, copy a skill, contact Git, or mutate an agent.
 */
export declare function planSetup(options?: SetupOptions): Promise<SetupPlan>;
/** Applies only the reviewed setup plan. Existing agent folders are never modified. */
export declare function applySetupPlan(plan: SetupPlan): Promise<ApplySetupResult>;
//# sourceMappingURL=setup.d.ts.map