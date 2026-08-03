import type { ImportCandidate } from "./import.js";
/** Parses `skill=/absolute/or/relative/path` without interpreting path contents. */
export declare function parseOwnedImportSpec(spec: string, cwd?: string): ImportCandidate;
export declare function validateImportCandidates(input: unknown): ImportCandidate[];
//# sourceMappingURL=cli-import.d.ts.map