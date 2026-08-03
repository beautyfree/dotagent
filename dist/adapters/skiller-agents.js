import { agentCatalogEntryToDescriptor } from "../catalog.js";
/**
 * Transitional adapter while Skiller's TOML catalog remains authoritative.
 * It maps only portable capabilities; install commands and UI metadata stay in Skiller.
 */
export function skillerAgentConfigToDescriptor(config, options = {}) {
    return agentCatalogEntryToDescriptor({
        slug: config.slug,
        displayName: config.name,
        skillRoots: [...config.global_paths],
        ...(config.cli_command ? { command: config.cli_command } : {}),
        detectionMarkers: [...config.detect_paths],
        readableRoots: (config.additional_readable_paths ?? []).map((entry) => ({
            path: entry.path,
            sourceAgent: entry.source_agent ?? "unknown",
        })),
    }, options);
}
export function skillerAgentCatalogToDescriptors(configs, options = {}) {
    return configs
        .map((config) => skillerAgentConfigToDescriptor(config, options))
        .sort((left, right) => left.slug.localeCompare(right.slug, "en"));
}
//# sourceMappingURL=skiller-agents.js.map