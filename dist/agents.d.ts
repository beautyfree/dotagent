export type Platform = "darwin" | "linux" | "win32";
export type DetectionRule = {
    kind: "command";
    command: string;
} | {
    kind: "marker";
    path: string;
    ignoreSkillsOnly?: boolean;
};
export type SkillDelivery = {
    kind: "native-shared";
} | {
    kind: "per-skill-link";
    roots: string[];
} | {
    kind: "copy-only";
    roots: string[];
};
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
export declare function agentResourceCapabilities(descriptor: AgentDescriptor): ResourceCapabilityMatrix;
export declare function validateAgentDescriptor(descriptor: AgentDescriptor): void;
//# sourceMappingURL=agents.d.ts.map