import type { ExistingTarget } from "./materialize.js";
export type ManagedTargetHealth = "missing" | "current" | "locally-modified" | "link-changed" | "invalid";
export interface ManagedTargetStatus {
    target: string;
    agent: string;
    skill: string;
    mode: "symlink" | "junction" | "copy";
    health: ManagedTargetHealth;
    source: string;
    sourceIntegrity: string;
    currentIntegrity: string | null;
}
export interface MaterializationStatus {
    library: string;
    targets: ManagedTargetStatus[];
    byAgent: Record<string, Record<string, ExistingTarget>>;
}
/** Reads only dotagents-owned ledger entries; unmanaged filesystem targets are discovered by machine planning. */
export declare function getMaterializationStatus(libraryRoot: string): Promise<MaterializationStatus>;
/** Combines dotagents ownership state with explicit target existence for a no-write plan. */
export declare function existingTargetsForPlan(libraryRoot: string, agentSlug: string, targetRoot: string, skillNames: string[]): Promise<Record<string, ExistingTarget>>;
//# sourceMappingURL=status.d.ts.map