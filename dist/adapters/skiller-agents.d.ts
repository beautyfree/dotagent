import type { AgentDescriptor, Platform } from "../agents.js";
export interface SkillerReadablePath {
    path: string;
    source_agent?: string;
}
export interface SkillerAgentConfigInput {
    slug: string;
    name: string;
    global_paths: string[];
    cli_command?: string | null;
    detect_paths: string[];
    additional_readable_paths?: SkillerReadablePath[];
}
export interface SkillerAgentCatalogOptions {
    platforms?: Platform[];
    sharedSkillsPath?: string;
}
/**
 * Transitional adapter while Skiller's TOML catalog remains authoritative.
 * It maps only portable capabilities; install commands and UI metadata stay in Skiller.
 */
export declare function skillerAgentConfigToDescriptor(config: SkillerAgentConfigInput, options?: SkillerAgentCatalogOptions): AgentDescriptor;
export declare function skillerAgentCatalogToDescriptors(configs: SkillerAgentConfigInput[], options?: SkillerAgentCatalogOptions): AgentDescriptor[];
//# sourceMappingURL=skiller-agents.d.ts.map