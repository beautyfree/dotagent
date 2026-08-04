import type { AgentDescriptor, Platform } from "./agents.js";
export interface AgentReadableRoot {
    path: string;
    sourceAgent: string;
}
export interface AgentCatalogEntry {
    slug: string;
    displayName: string;
    skillRoots: string[];
    projectSkillsDir?: string;
    command?: string;
    detectionMarkers: string[];
    readableRoots: AgentReadableRoot[];
}
export interface BuiltinAgentCatalogOptions {
    platforms?: Platform[];
    sharedSkillsPath?: string;
}
/**
 * Versioned, provider-neutral skill capability catalog shared by CLI and API consumers.
 * Installation commands and product copy intentionally remain outside the core.
 */
export declare const BUILTIN_AGENT_CATALOG_VERSION = 1;
/** Returns defensive copies so consumers cannot mutate the process-wide catalog. */
export declare function builtinAgentCatalog(): AgentCatalogEntry[];
export declare function builtinAgentCatalogEntry(slug: string): AgentCatalogEntry | null;
export declare function agentCatalogEntryToDescriptor(entry: AgentCatalogEntry, options?: BuiltinAgentCatalogOptions): AgentDescriptor;
export declare function builtinAgentDescriptors(options?: BuiltinAgentCatalogOptions): AgentDescriptor[];
//# sourceMappingURL=catalog.d.ts.map