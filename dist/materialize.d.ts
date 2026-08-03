import type { AgentDescriptor, Platform } from "./agents.js";
import type { LibraryInventory } from "./inventory.js";
export type MaterializationMode = "native" | "symlink" | "junction" | "copy";
export type ExistingTarget = {
    state: "absent";
} | {
    state: "managed-link";
    source: string;
} | {
    state: "managed-copy";
    integrity: string;
} | {
    state: "unmanaged";
};
export interface AgentMaterializationTarget {
    descriptor: AgentDescriptor;
    platform: Platform;
    detected: boolean;
    mode: MaterializationMode;
    /** Resolved machine-local root. Omitted only for native shared readers. */
    root?: string;
    existing: Record<string, ExistingTarget>;
}
export type MaterializationAction = "available-native" | "create-symlink" | "create-junction" | "create-copy" | "update-copy" | "unchanged" | "conflict";
export interface MaterializationOperation {
    agent: string;
    skill: string;
    action: MaterializationAction;
    source: string;
    target: string | null;
    reason?: string;
}
export interface MaterializationPlan {
    kind: "materialize";
    schemaVersion: 1;
    planId: string;
    library: string;
    operations: MaterializationOperation[];
    hasConflicts: boolean;
}
/** Produces exact, serializable actions and never turns unmanaged content into a write. */
export declare function planMaterialization(inventory: LibraryInventory, targets: AgentMaterializationTarget[]): MaterializationPlan;
//# sourceMappingURL=materialize.d.ts.map