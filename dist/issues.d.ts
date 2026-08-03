export type DotagentIssueCode = "invalid-json" | "invalid-manifest" | "invalid-lockfile" | "unsupported-schema" | "unsafe-path" | "duplicate-skill" | "integrity-mismatch" | "unsafe-link" | "limit-exceeded" | "missing-skill-file" | "invalid-config" | "lockfile-missing" | "lockfile-stale" | "local-state-not-ignored" | "missing-skill-metadata" | "missing-license" | "file-not-found" | "io-error";
export interface DotagentIssue {
    code: DotagentIssueCode;
    message: string;
    remediation: string;
    path?: string;
    field?: string;
    severity?: "error" | "warning" | "info";
}
export type DotagentResult<T> = {
    ok: true;
    value: T;
    issues: [];
} | {
    ok: false;
    issues: DotagentIssue[];
};
export declare class DotagentError extends Error {
    readonly issues: DotagentIssue[];
    constructor(message: string, issues: DotagentIssue[]);
}
//# sourceMappingURL=issues.d.ts.map