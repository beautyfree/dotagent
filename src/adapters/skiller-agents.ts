import type { AgentDescriptor, Platform, SkillDelivery } from "../agents.js";

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
export function skillerAgentConfigToDescriptor(
  config: SkillerAgentConfigInput,
  options: SkillerAgentCatalogOptions = {},
): AgentDescriptor {
  const sharedSkillsPath = options.sharedSkillsPath ?? "~/.agents/skills";
  const readsShared = config.additional_readable_paths?.some((entry) =>
    entry.source_agent === "shared" || entry.path === sharedSkillsPath
  ) ?? false;
  const skills: SkillDelivery[] = [
    ...(readsShared ? [{ kind: "native-shared" as const }] : []),
    ...(config.global_paths.length > 0 ? [{ kind: "per-skill-link" as const, roots: [...config.global_paths] }] : []),
  ];
  if (skills.length === 0) skills.push({ kind: "config-path", configId: `skiller:${config.slug}` });
  return {
    slug: config.slug,
    displayName: config.name,
    platforms: options.platforms ?? ["darwin", "linux", "win32"],
    detection: [
      ...(config.cli_command ? [{ kind: "command" as const, command: config.cli_command }] : []),
      ...config.detect_paths.map((marker) => ({ kind: "marker" as const, path: marker, ignoreSkillsOnly: true })),
    ],
    skills,
  };
}

export function skillerAgentCatalogToDescriptors(
  configs: SkillerAgentConfigInput[],
  options: SkillerAgentCatalogOptions = {},
): AgentDescriptor[] {
  return configs
    .map((config) => skillerAgentConfigToDescriptor(config, options))
    .sort((left, right) => left.slug.localeCompare(right.slug, "en"));
}
