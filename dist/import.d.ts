import { type SecretFileFinding } from "./audit.js";
import { type PortableConfig } from "./config.js";
import { type LibraryManifest } from "./schema.js";
export interface OwnedImportCandidate {
    kind: "owned";
    skill: string;
    sourcePath: string;
    agents?: string[];
}
export interface DependencyImportCandidate {
    kind: "dependency";
    skill: string;
    package: string;
    url: string;
    ref: string;
    skillPath: string;
    agents?: string[];
    source?: "git" | "skills-cli";
}
export interface LocalOnlyImportCandidate {
    kind: "local-only" | "excluded";
    skill: string;
    sourcePath?: string;
    reason: string;
}
export type ImportCandidate = OwnedImportCandidate | DependencyImportCandidate | LocalOnlyImportCandidate;
export type ImportAction = "copy-owned" | "record-dependency" | "unchanged" | "leave-local" | "exclude" | "conflict";
export interface ImportOperation {
    skill: string;
    action: ImportAction;
    sourceKind: ImportCandidate["kind"];
    source?: string;
    sourceIntegrity?: string;
    target?: string;
    package?: string;
    reason?: string;
}
export type ImportSecretFinding = SecretFileFinding & {
    skill: string;
};
export interface ImportPlan {
    kind: "import";
    schemaVersion: 1;
    planId: string;
    library: string;
    baseManifestHash: string;
    baseConfigHash: string;
    nextManifest: LibraryManifest;
    nextConfig: PortableConfig;
    operations: ImportOperation[];
    secretFindings: ImportSecretFinding[];
    hasConflicts: boolean;
    requiresResolve: boolean;
}
/**
 * Builds the exact portable mutation from reviewed candidates. It reads and
 * hashes local sources but performs no writes, Git fetches, or script execution.
 */
export declare function planImport(libraryRoot: string, candidates: ImportCandidate[]): Promise<ImportPlan>;
//# sourceMappingURL=import.d.ts.map