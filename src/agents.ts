export type Platform = "darwin" | "linux" | "win32";

export type DetectionRule =
  | { kind: "command"; command: string }
  | { kind: "marker"; path: string; ignoreSkillsOnly?: boolean };

export type SkillDelivery =
  | { kind: "native-shared" }
  | { kind: "per-skill-link"; roots: string[] }
  | { kind: "config-path"; configId: string }
  | { kind: "copy-only"; roots: string[] };

export interface AgentDescriptor {
  slug: string;
  displayName: string;
  platforms: Platform[];
  detection: DetectionRule[];
  skills: SkillDelivery[];
}

export function validateAgentDescriptor(descriptor: AgentDescriptor): void {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(descriptor.slug)) throw new Error(`Invalid agent slug: ${descriptor.slug}`);
  if (!descriptor.displayName.trim()) throw new Error(`Agent ${descriptor.slug} has no display name`);
  if (descriptor.platforms.length === 0) throw new Error(`Agent ${descriptor.slug} has no supported platform`);
  if (descriptor.skills.length === 0) throw new Error(`Agent ${descriptor.slug} has no skill delivery capability`);
}
