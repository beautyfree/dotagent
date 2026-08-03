/**
 * Transitional adapter while Skiller's TOML catalog remains authoritative.
 * It maps only portable capabilities; install commands and UI metadata stay in Skiller.
 */
export function skillerAgentConfigToDescriptor(config, options = {}) {
    const sharedSkillsPath = options.sharedSkillsPath ?? "~/.agents/skills";
    const readsShared = config.additional_readable_paths?.some((entry) => entry.source_agent === "shared" || entry.path === sharedSkillsPath) ?? false;
    const skills = [
        ...(readsShared ? [{ kind: "native-shared" }] : []),
        ...(config.global_paths.length > 0 ? [{ kind: "per-skill-link", roots: [...config.global_paths] }] : []),
    ];
    if (skills.length === 0)
        skills.push({ kind: "config-path", configId: `skiller:${config.slug}` });
    return {
        slug: config.slug,
        displayName: config.name,
        platforms: options.platforms ?? ["darwin", "linux", "win32"],
        detection: [
            ...(config.cli_command ? [{ kind: "command", command: config.cli_command }] : []),
            ...config.detect_paths.map((marker) => ({ kind: "marker", path: marker, ignoreSkillsOnly: true })),
        ],
        skills,
    };
}
export function skillerAgentCatalogToDescriptors(configs, options = {}) {
    return configs
        .map((config) => skillerAgentConfigToDescriptor(config, options))
        .sort((left, right) => left.slug.localeCompare(right.slug, "en"));
}
//# sourceMappingURL=skiller-agents.js.map