import type { DiscoveredProvenance } from "../discovery.js";
export declare const SKILLS_CLI_LOCK_VERSION: 3;
export interface SkillsCliLockEntry {
    name: string;
    source: string;
    source_type: string;
    source_url: string;
    ref: string | null;
    skill_path: string | null;
    updated_at: string;
}
export interface SkillsCliLock {
    path: string;
    version: typeof SKILLS_CLI_LOCK_VERSION;
    skills: SkillsCliLockEntry[];
}
export interface SkillsCliProvenanceResult {
    provenance: DiscoveredProvenance[];
    skipped: {
        skill: string;
        reason: string;
    }[];
}
export declare function getSkillsCliLockPath(env?: NodeJS.ProcessEnv, home?: string): string;
/** Parse the documented Skills CLI v3 shape without guessing future versions. */
export declare function parseSkillsCliLock(input: string, sourcePath?: string): SkillsCliLock | null;
/** Read-only adapter; the upstream lockfile is never rewritten. */
export declare function readSkillsCliLock(filePath?: string): SkillsCliLock | null;
/** Maps only complete v3 entries; incomplete upstream data stays visible instead of becoming an owned copy. */
export declare function skillsCliLockToProvenance(lock: SkillsCliLock): SkillsCliProvenanceResult;
//# sourceMappingURL=skills-cli.d.ts.map