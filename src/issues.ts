export type DotagentsIssueCode =
  | "invalid-json"
  | "invalid-manifest"
  | "invalid-lockfile"
  | "unsupported-schema"
  | "unsafe-path"
  | "duplicate-skill"
  | "integrity-mismatch"
  | "unsafe-link"
  | "limit-exceeded"
  | "missing-skill-file"
  | "invalid-config"
  | "lockfile-missing"
  | "lockfile-stale"
  | "local-state-not-ignored"
  | "missing-skill-metadata"
  | "missing-license"
  | "file-not-found"
  | "io-error";

export interface DotagentsIssue {
  code: DotagentsIssueCode;
  message: string;
  remediation: string;
  path?: string;
  field?: string;
  severity?: "error" | "warning" | "info";
}

export type DotagentsResult<T> = { ok: true; value: T; issues: [] } | { ok: false; issues: DotagentsIssue[] };

export class DotagentsError extends Error {
  readonly issues: DotagentsIssue[];

  constructor(message: string, issues: DotagentsIssue[]) {
    super(message);
    this.name = "DotagentsError";
    this.issues = issues;
  }
}
