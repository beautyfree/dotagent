export type DotagentIssueCode =
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
  | "file-not-found"
  | "io-error";

export interface DotagentIssue {
  code: DotagentIssueCode;
  message: string;
  remediation: string;
  path?: string;
  field?: string;
}

export type DotagentResult<T> =
  | { ok: true; value: T; issues: [] }
  | { ok: false; issues: DotagentIssue[] };

export class DotagentError extends Error {
  readonly issues: DotagentIssue[];

  constructor(message: string, issues: DotagentIssue[]) {
    super(message);
    this.name = "DotagentError";
    this.issues = issues;
  }
}
