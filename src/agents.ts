export type Platform = "darwin" | "linux" | "win32";

export type DetectionRule =
  | { kind: "command"; command: string }
  | { kind: "marker"; path: string; ignoreSkillsOnly?: boolean };

export type SkillDelivery =
  | { kind: "native-shared" }
  | { kind: "per-skill-link"; roots: string[] }
  | { kind: "copy-only"; roots: string[] };

export type ResourceSupport = {
  support: "native" | "lossy" | "unsupported";
  adapter?: string;
  loss?: string;
};

export type ResourceCapabilityMatrix = Record<"skill" | "instruction" | "command" | "subagent", ResourceSupport>;

export interface AgentDescriptor {
  slug: string;
  displayName: string;
  platforms: Platform[];
  detection: DetectionRule[];
  skills: SkillDelivery[];
  /** Explicit v2 matrix. Legacy extension descriptors receive a skills-only fallback. */
  resources?: ResourceCapabilityMatrix;
}

export function agentResourceCapabilities(descriptor: AgentDescriptor): ResourceCapabilityMatrix {
  return (
    descriptor.resources ?? {
      skill: { support: "native", adapter: "legacy-skill-delivery" },
      instruction: { support: "unsupported" },
      command: { support: "unsupported" },
      subagent: { support: "unsupported" },
    }
  );
}

export function validateAgentDescriptor(descriptor: AgentDescriptor): void {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(descriptor.slug)) throw new Error(`Invalid agent slug: ${descriptor.slug}`);
  if (!descriptor.displayName.trim()) throw new Error(`Agent ${descriptor.slug} has no display name`);
  if (descriptor.platforms.length === 0) throw new Error(`Agent ${descriptor.slug} has no supported platform`);
  if (descriptor.skills.length === 0) throw new Error(`Agent ${descriptor.slug} has no skill delivery capability`);
  for (const kind of ["skill", "instruction", "command", "subagent"] as const) {
    const capability = agentResourceCapabilities(descriptor)[kind];
    if (!capability) throw new Error(`Agent ${descriptor.slug} has no ${kind} resource capability declaration`);
    if (capability.support === "lossy" && (!capability.adapter?.trim() || !capability.loss?.trim())) {
      throw new Error(`Agent ${descriptor.slug} has an incomplete lossy ${kind} adapter declaration`);
    }
    if (capability.support === "unsupported" && (capability.adapter || capability.loss)) {
      throw new Error(`Agent ${descriptor.slug} cannot attach an adapter to unsupported ${kind} resources`);
    }
  }
  for (const rule of descriptor.detection) {
    const value = rule.kind === "command" ? rule.command : rule.path;
    if (!value.trim() || /[\r\n\0]/.test(value))
      throw new Error(`Agent ${descriptor.slug} has an invalid detection rule`);
  }
  for (const delivery of descriptor.skills) {
    if (delivery.kind === "native-shared") continue;
    if (delivery.roots.length === 0 || delivery.roots.some((root) => !root.trim() || /[\r\n\0]/.test(root))) {
      throw new Error(`Agent ${descriptor.slug} has an invalid ${delivery.kind} root`);
    }
  }
}
