export type SecretFinding = {
    rule: "private-key" | "github-token" | "provider-token" | "aws-access-key" | "connection-string" | "credential-assignment";
    line: number;
    column: number;
};
/** Returns locations and rule IDs only; matched values never cross the API boundary. */
export declare function scanTextForSecrets(text: string): SecretFinding[];
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
import type { DotagentIssue } from "./issues.js";
import { type LibraryInventory } from "./inventory.js";
//# sourceMappingURL=audit.d.ts.map