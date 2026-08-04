import { type ApplyMaterializationResult } from "./materialize-apply.js";
import { type MaterializationPlan } from "./materialize.js";
export interface ConnectOptions {
    root?: string;
    home?: string;
    platform?: NodeJS.Platform;
    environment?: NodeJS.ProcessEnv;
}
export interface ConnectSummary {
    agentsFound: number;
    sharedAgents: string[];
    linkedAgents: string[];
    linksToCreate: number;
    alreadyConnected: number;
    needsReview: number;
}
export interface ConnectPlan {
    kind: "connect";
    schemaVersion: 1;
    planId: string;
    root: string;
    materialization: MaterializationPlan;
    summary: ConnectSummary;
}
/**
 * Plans the natural, safe destinations for currently detected agents. Shared
 * readers receive no filesystem writes; other agents receive per-skill links.
 */
export declare function planConnect(options?: ConnectOptions): Promise<ConnectPlan>;
/** Applies only an unchanged, conflict-free connection plan. */
export declare function applyConnectPlan(plan: ConnectPlan): Promise<ApplyMaterializationResult>;
//# sourceMappingURL=connect.d.ts.map