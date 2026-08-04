import type { ImportCandidate } from "./import.js";
import type { DotagentsIssue } from "./issues.js";
export type DiscoveryLocationKind = "shared" | "agent-local" | "inherited";
export interface SkillDiscoveryRoot {
    path: string;
    agent?: string;
    kind: DiscoveryLocationKind;
}
export interface SkillDiscoveryLocation {
    agent?: string;
    kind: DiscoveryLocationKind;
}
export interface DiscoveredSkill {
    candidateKey: string;
    name: string;
    description: string | null;
    whenToUse: string | null;
    integrity: string;
    fileCount: number;
    bytes: number;
    /** Machine-local source. Renderer adapters must redact this field. */
    sourcePath: string;
    locations: SkillDiscoveryLocation[];
    metadataValid: boolean;
}
export interface DiscoveryCollision {
    name: string;
    candidateKeys: string[];
}
export interface SkillDiscoveryReport {
    skills: DiscoveredSkill[];
    collisions: DiscoveryCollision[];
    issues: DotagentsIssue[];
    linkedAliases: number;
}
export interface DiscoveryLimits {
    maxDepth: number;
    maxDirectories: number;
}
export declare const DEFAULT_DISCOVERY_LIMITS: DiscoveryLimits;
/**
 * Read-only cross-agent discovery. Byte-identical aliases are one skill with
 * multiple locations; same-name content differences remain explicit conflicts.
 */
export declare function discoverSkills(roots: SkillDiscoveryRoot[], limits?: DiscoveryLimits): Promise<SkillDiscoveryReport>;
export interface DiscoveredProvenance {
    skill: string;
    package: string;
    url: string;
    ref: string;
    skillPath: string;
    source?: "git" | "skills-cli";
    integrity?: string;
}
/** Produces conservative defaults: verified provenance is referenced; everything else is owned. */
export declare function suggestImportCandidates(report: SkillDiscoveryReport, provenance?: DiscoveredProvenance[]): ImportCandidate[];
//# sourceMappingURL=discovery.d.ts.map