import type { DotagentIssue } from "./issues.js";
import { type LibraryInventory } from "./inventory.js";
export type SecretFinding = {
    rule: "private-key" | "github-token" | "provider-token" | "aws-access-key" | "connection-string" | "credential-assignment";
    line: number;
    column: number;
};
export type SecretFileFinding = SecretFinding & {
    /** Portable path inside the reviewed skill. Never an absolute machine path. */
    relativePath: string;
};
/** Returns locations and rule IDs only; matched values never cross the API boundary. */
export declare function scanTextForSecrets(text: string): SecretFinding[];
/**
 * Scans a skill that already passed the bounded inventory rules. The returned
 * findings contain only a relative file location and rule ID; matched values
 * are deliberately discarded before crossing the API boundary.
 */
export declare function scanSkillForSecrets(skillRoot: string): Promise<SecretFileFinding[]>;
export interface AuditLibraryOptions {
    root: string;
    visibility?: "private" | "team" | "public";
}
export interface LibraryAuditReport {
    ok: boolean;
    publicReady: boolean;
    library: LibraryInventory | null;
    issues: DotagentIssue[];
}
/** Structural audit only: reads bounded files already accepted by inventory and never executes skill content. */
export declare function auditLibrary(options: AuditLibraryOptions): Promise<LibraryAuditReport>;
//# sourceMappingURL=audit.d.ts.map