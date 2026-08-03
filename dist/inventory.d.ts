import type { DotagentResult } from "./issues.js";
export interface ScanLimits {
    maxFilesPerSkill: number;
    maxFileBytes: number;
    maxSkillBytes: number;
}
export declare const DEFAULT_SCAN_LIMITS: ScanLimits;
export interface OwnedSkillInventory {
    name: string;
    path: string;
    fileCount: number;
    bytes: number;
    integrity: string;
}
export interface LibraryInventory {
    root: string;
    name: string;
    version: string;
    ownedSkills: OwnedSkillInventory[];
    dependencyCount: number;
    locked: boolean;
}
export interface ScannedSkill extends OwnedSkillInventory {
    root: string;
}
export declare function declaredSkillName(skillMd: string): string | null;
export declare function scanOwnedSkill(root: string, skillPath: string, limits?: ScanLimits): Promise<DotagentResult<ScannedSkill>>;
export declare function scanLibrary(root: string, limits?: ScanLimits): Promise<DotagentResult<LibraryInventory>>;
//# sourceMappingURL=inventory.d.ts.map