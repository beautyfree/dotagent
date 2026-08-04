import { z } from "zod";
export declare const portableGlobPatternSchema: z.ZodEffects<z.ZodString, string, string>;
export interface WildcardSelectionInput {
    source: string;
    revision: string;
    subtree?: string;
    available: string[];
    include: string[];
    exclude?: string[];
}
export interface WildcardSelectionEntry {
    path: string;
    selected: boolean;
    reason: "included" | "excluded" | "not-matched";
    matchedPattern?: string;
}
export interface WildcardSelectionPlan {
    kind: "wildcard-selection";
    schemaVersion: 1;
    planId: string;
    source: string;
    revision: string;
    subtree: string;
    include: string[];
    exclude: string[];
    indexIntegrity: string;
    entries: WildcardSelectionEntry[];
    selected: string[];
}
/** Build a complete no-write wildcard review bound to the immutable source index. */
export declare function planWildcardSelection(input: WildcardSelectionInput): WildcardSelectionPlan;
export interface SkillPathDiscoveryOptions {
    maxDirectories?: number;
    maxDepth?: number;
}
/** Discover only SKILL.md locations; never reads or executes skill content. */
export declare function discoverSkillPaths(root: string, options?: SkillPathDiscoveryOptions): Promise<string[]>;
//# sourceMappingURL=selection.d.ts.map