import { type SecretFinding } from "./audit.js";
export interface SkillExportLimits {
    maxFiles: number;
    maxBytes: number;
    excludedDirectories: readonly string[];
}
export declare const DEFAULT_SKILL_EXPORT_LIMITS: SkillExportLimits;
export interface SkillExportFile {
    relativePath: string;
    size: number;
    sha256: string;
}
export interface SkillExportFinding extends SecretFinding {
    relativePath: string;
}
export interface SkillExportPlan {
    skill: string;
    sourcePath: string;
    sha256: string;
    files: SkillExportFile[];
    excludedPaths: string[];
    secretFindings: SkillExportFinding[];
}
/**
 * Builds a deterministic, value-free, read-only export plan for an owned skill.
 * Symlinks and unsupported file types are rejected instead of being followed.
 */
export declare function planSkillExport(skill: string, sourcePath: string, limits?: SkillExportLimits): SkillExportPlan;
//# sourceMappingURL=export-policy.d.ts.map